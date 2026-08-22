import { createHash } from 'node:crypto';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectLockConfigurationCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  PutObjectLegalHoldCommand,
  PutObjectRetentionCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transform } from 'node:stream';
import type { Readable } from 'node:stream';
import type {
  StorageEncryptionMode,
  ValidatedEnvironment,
} from '../../config/env.validation';
import { PrismaService } from '../database/prisma.service';
import {
  assertTenantTransactionContext,
  assertUuidContextField,
  type TenantTransactionContext,
} from '../database/tenant-context';
import { ClamAvMalwareScanner } from './clamav-malware-scanner.service';

export interface PutObjectInput {
  key: string;
  tenantContext: TenantTransactionContext;
  body: Uint8Array | Buffer | Readable;
  contentType: string;
  metadata?: Record<string, string>;
  sourcePath?: string;
  versionId?: string;
  retentionUntil?: Date;
  legalHold?: boolean;
}

export interface StoredObjectMetadata {
  id: string;
  key: string;
  versionId?: string;
  sha256: string;
  sizeBytes: bigint;
  contentType: string;
  encryptionMode: StorageEncryptionMode;
  malwareStatus: string;
  retentionUntil?: Date;
  legalHold: boolean;
}

export interface ObjectStorageService {
  putObject(input: PutObjectInput): Promise<StoredObjectMetadata>;
  getDownloadUrl(
    tenantContext: TenantTransactionContext,
    key: string,
    expiresInSeconds?: number,
  ): Promise<string>;
  deleteObject(
    tenantContext: TenantTransactionContext,
    key: string,
  ): Promise<void>;
}

@Injectable()
export class S3ObjectStorageService
  implements ObjectStorageService, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(S3ObjectStorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly versioningEnabled: boolean;
  private readonly objectLockEnabled: boolean;
  private readonly encryptionMode: StorageEncryptionMode;
  private readonly kmsKeyId?: string;

  constructor(
    private readonly config: ConfigService<ValidatedEnvironment, true>,
    private readonly prisma: PrismaService,
    private readonly malwareScanner: ClamAvMalwareScanner,
  ) {
    this.bucket = config.getOrThrow('S3_BUCKET');
    this.versioningEnabled = config.getOrThrow('S3_VERSIONING_ENABLED');
    this.objectLockEnabled = config.getOrThrow('S3_OBJECT_LOCK_ENABLED');
    this.encryptionMode = config.getOrThrow('S3_ENCRYPTION_MODE');
    this.kmsKeyId = config.get<string>('S3_KMS_KEY_ID');
    this.client = new S3Client({
      endpoint: config.getOrThrow('S3_ENDPOINT'),
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow('S3_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow('S3_SECRET_KEY'),
      },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (!isMissingBucketError(error)) {
        throw error;
      }
      await this.client.send(
        new CreateBucketCommand({
          Bucket: this.bucket,
          ObjectLockEnabledForBucket: this.objectLockEnabled,
        }),
      );
    }

    if (this.versioningEnabled) {
      await this.client.send(
        new PutBucketVersioningCommand({
          Bucket: this.bucket,
          VersioningConfiguration: { Status: 'Enabled' },
        }),
      );
    }

    if (this.objectLockEnabled) {
      const lock = await this.client.send(
        new GetObjectLockConfigurationCommand({ Bucket: this.bucket }),
      );
      if (lock.ObjectLockConfiguration?.ObjectLockEnabled !== 'Enabled') {
        throw new Error('S3 object lock must be enabled for this deployment');
      }
    }

    this.logger.log(
      `Object storage bucket ${this.bucket} is ready; versioning=${
        this.versioningEnabled ? 'enabled' : 'disabled'
      }, objectLock=${this.objectLockEnabled ? 'enabled' : 'disabled'}, encryption=${
        this.encryptionMode
      }, malwareScanning=${this.malwareScanner.enabled ? 'enabled' : 'disabled'}`,
    );
  }

  async healthCheck(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async putObject(input: PutObjectInput): Promise<StoredObjectMetadata> {
    assertTenantTransactionContext(input.tenantContext);
    const scopedKey = buildTenantObjectKey(
      input.tenantContext.tenantId,
      input.key,
    );
    if (this.malwareScanner.enabled) {
      if (!input.sourcePath) {
        throw new Error('A sourcePath is required for malware scanning');
      }
      const scanStatus = await this.malwareScanner.scanFile(input.sourcePath);
      if (scanStatus === 'INFECTED') {
        throw new Error('Object rejected by malware scanning');
      }
    }

    const prepared = prepareBodyForIntegrity(input.body);
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: scopedKey,
        Body: prepared.body,
        ContentType: input.contentType,
        Metadata: input.metadata,
        ...(this.encryptionMode !== 'NONE'
          ? {
              ServerSideEncryption: this.encryptionMode,
              ...(this.encryptionMode === 'aws:kms' && this.kmsKeyId
                ? { SSEKMSKeyId: this.kmsKeyId }
                : {}),
            }
          : {}),
      }),
    );

    const digest = prepared.finalize();
    const versionId = result.VersionId ?? input.versionId;
    if (input.retentionUntil && input.retentionUntil <= new Date()) {
      await this.deleteUploadedObject(scopedKey, versionId);
      throw new Error('Retention must be set to a future time');
    }
    if (input.retentionUntil || input.legalHold) {
      if (!this.objectLockEnabled || !versionId) {
        await this.deleteUploadedObject(scopedKey, versionId);
        throw new Error(
          'Retention and legal hold require versioned S3 object lock storage',
        );
      }
      try {
        await this.applyObjectLock(
          scopedKey,
          versionId,
          input.retentionUntil,
          input.legalHold ?? false,
        );
      } catch (error) {
        await this.deleteUploadedObject(scopedKey, versionId);
        throw error;
      }
    }

    const malwareStatus = this.malwareScanner.enabled ? 'CLEAN' : 'NOT_SCANNED';
    try {
      const record = await this.prisma.withTenantContext(
        input.tenantContext,
        (transaction) =>
          transaction.storageObject.create({
            data: {
              tenantId: input.tenantContext.tenantId,
              key: scopedKey,
              versionId,
              sha256: digest.sha256,
              sizeBytes: digest.sizeBytes,
              contentType: input.contentType,
              encryptionMode: this.encryptionMode,
              malwareStatus,
              malwareScannedAt: this.malwareScanner.enabled ? new Date() : null,
              retentionUntil: input.retentionUntil,
              legalHold: input.legalHold ?? false,
              metadata: input.metadata,
            },
          }),
      );
      return toStoredObjectMetadata(record);
    } catch (error) {
      await this.deleteUploadedObject(scopedKey, versionId);
      throw error;
    }
  }

  async getDownloadUrl(
    tenantContext: TenantTransactionContext,
    key: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    if (
      !Number.isInteger(expiresInSeconds) ||
      expiresInSeconds < 60 ||
      expiresInSeconds > 3_600
    ) {
      throw new Error(
        'Download URL expiry must be an integer from 60 to 3600 seconds',
      );
    }
    const scopedKey = buildTenantObjectKey(tenantContext.tenantId, key);
    const record = await this.prisma.withTenantContext(
      tenantContext,
      (transaction) =>
        transaction.storageObject.findFirst({
          where: {
            tenantId: tenantContext.tenantId,
            key: scopedKey,
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        }),
    );
    if (!record) throw new Error('Storage metadata was not found');
    if (record.malwareStatus !== 'CLEAN' && this.malwareScanner.enabled) {
      throw new Error('Object is not approved for download');
    }
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: record.key,
        ...(record.versionId ? { VersionId: record.versionId } : {}),
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async deleteObject(
    tenantContext: TenantTransactionContext,
    key: string,
  ): Promise<void> {
    const scopedKey = buildTenantObjectKey(tenantContext.tenantId, key);
    const record = await this.prisma.withTenantContext(
      tenantContext,
      (transaction) =>
        transaction.storageObject.findFirst({
          where: {
            tenantId: tenantContext.tenantId,
            key: scopedKey,
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        }),
    );
    if (!record) throw new Error('Storage metadata was not found');
    if (record.legalHold) throw new Error('Object is protected by legal hold');
    if (record.retentionUntil && record.retentionUntil > new Date()) {
      throw new Error('Object retention period has not expired');
    }

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: record.key,
        ...(record.versionId ? { VersionId: record.versionId } : {}),
      }),
    );
    await this.prisma.withTenantContext(tenantContext, (transaction) =>
      transaction.storageObject.update({
        where: { id: record.id },
        data: { deletedAt: new Date() },
      }),
    );
  }

  private async applyObjectLock(
    key: string,
    versionId: string,
    retentionUntil: Date | undefined,
    legalHold: boolean,
  ): Promise<void> {
    if (retentionUntil) {
      await this.client.send(
        new PutObjectRetentionCommand({
          Bucket: this.bucket,
          Key: key,
          VersionId: versionId,
          Retention: { Mode: 'GOVERNANCE', RetainUntilDate: retentionUntil },
        }),
      );
    }
    if (legalHold) {
      await this.client.send(
        new PutObjectLegalHoldCommand({
          Bucket: this.bucket,
          Key: key,
          VersionId: versionId,
          LegalHold: { Status: 'ON' },
        }),
      );
    }
  }

  private async deleteUploadedObject(
    key: string,
    versionId: string | undefined,
  ): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ...(versionId ? { VersionId: versionId } : {}),
        }),
      );
    } catch (cleanupError) {
      this.logger.error(
        `Storage cleanup failed for object ${key}: ${errorName(cleanupError)}`,
      );
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}

export function buildTenantObjectKey(
  tenantId: string,
  logicalKey: string,
): string {
  assertUuidContextField(tenantId, 'tenantId');
  if (!logicalKey || logicalKey.startsWith('/') || logicalKey.includes('..')) {
    throw new Error('Storage object key is invalid');
  }
  return `tenants/${tenantId}/${logicalKey}`;
}

export function prepareBodyForIntegrity(body: Uint8Array | Buffer | Readable): {
  body: Uint8Array | Buffer | Readable;
  finalize: () => { sha256: string; sizeBytes: bigint };
} {
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    const buffer = Buffer.from(body);
    const hash = createHash('sha256').update(buffer).digest('hex');
    return {
      body: buffer,
      finalize: () => ({ sha256: hash, sizeBytes: BigInt(buffer.length) }),
    };
  }

  const hash = createHash('sha256');
  let sizeBytes = 0n;
  const transform = new Transform({
    transform(chunk: Buffer | Uint8Array, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(buffer);
      sizeBytes += BigInt(buffer.length);
      callback(null, buffer);
    },
  });
  body.pipe(transform);
  return {
    body: transform,
    finalize: () => ({ sha256: hash.digest('hex'), sizeBytes }),
  };
}

function toStoredObjectMetadata(record: {
  id: string;
  key: string;
  versionId: string | null;
  sha256: string;
  sizeBytes: bigint;
  contentType: string;
  encryptionMode: string;
  malwareStatus: string;
  retentionUntil: Date | null;
  legalHold: boolean;
}): StoredObjectMetadata {
  return {
    id: record.id,
    key: record.key,
    ...(record.versionId ? { versionId: record.versionId } : {}),
    sha256: record.sha256,
    sizeBytes: record.sizeBytes,
    contentType: record.contentType,
    encryptionMode: record.encryptionMode as StorageEncryptionMode,
    malwareStatus: record.malwareStatus,
    ...(record.retentionUntil ? { retentionUntil: record.retentionUntil } : {}),
    legalHold: record.legalHold,
  };
}

function isMissingBucketError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchBucket' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
