import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable } from 'node:stream';
import type { ValidatedEnvironment } from '../../config/env.validation';

export interface PutObjectInput {
  key: string;
  body: Uint8Array | Buffer | Readable;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface ObjectStorageService {
  putObject(input: PutObjectInput): Promise<void>;
  getDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

@Injectable()
export class S3ObjectStorageService implements ObjectStorageService, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(S3ObjectStorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<ValidatedEnvironment, true>) {
    this.bucket = config.getOrThrow('S3_BUCKET');
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
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
    this.logger.log(`Object storage bucket ${this.bucket} is ready`);
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      Metadata: input.metadata,
    }));
  }

  async getDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async onModuleDestroy(): Promise<void> {
    this.client.destroy();
  }
}

function isMissingBucketError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: number } };
  return candidate.name === 'NotFound'
    || candidate.name === 'NoSuchBucket'
    || candidate.$metadata?.httpStatusCode === 404;
}
