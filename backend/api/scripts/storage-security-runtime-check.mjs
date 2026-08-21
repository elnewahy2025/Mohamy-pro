import 'reflect-metadata';
import { randomUUID, createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectLegalHoldCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const require = createRequire(import.meta.url);
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/src/app.module.js');
const { S3ObjectStorageService } = require('../dist/src/infrastructure/storage/object-storage.service.js');
const { PrismaService } = require('../dist/src/infrastructure/database/prisma.service.js');
const mode = process.env.STORAGE_SECURITY_MODE ?? 'clean';
const bucket = process.env.S3_BUCKET;
const endpoint = process.env.S3_ENDPOINT;
const accessKey = process.env.S3_ACCESS_KEY;
const secretKey = process.env.S3_SECRET_KEY;

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function required(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function createS3Client() {
  return new S3Client({
    endpoint: required('S3_ENDPOINT', endpoint),
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: required('S3_ACCESS_KEY', accessKey),
      secretAccessKey: required('S3_SECRET_KEY', secretKey),
    },
  });
}

async function deleteVersion(client, key, versionId, bypassGovernanceRetention = false) {
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
      VersionId: versionId,
      ...(bypassGovernanceRetention ? { BypassGovernanceRetention: true } : {}),
    }),
  );
}

async function runCleanMode(storage, prisma, client) {
  const suffix = randomUUID().replaceAll('-', '');
  const payload = Buffer.from(`Mohamy Phase 1 clean storage evidence ${suffix}`, 'utf8');
  const sourcePath = path.join(os.tmpdir(), `mohamy-storage-clean-${suffix}.bin`);
  const versionKey = `phase1/runtime/versioned-${suffix}.bin`;
  const heldKey = `phase1/runtime/held-${suffix}.bin`;
  const payloadHash = sha256(payload);
  await fs.writeFile(sourcePath, payload, { flag: 'wx' });

  const storedVersions = [];
  let heldObject;
  try {
    const first = await storage.putObject({
      key: versionKey,
      body: payload,
      contentType: 'application/octet-stream',
      sourcePath,
    });
    const second = await storage.putObject({
      key: versionKey,
      body: payload,
      contentType: 'application/octet-stream',
      sourcePath,
    });
    storedVersions.push(first, second);
    assertCondition(first.versionId, 'First upload did not return a version ID');
    assertCondition(second.versionId, 'Second upload did not return a version ID');
    assertCondition(first.versionId !== second.versionId, 'Version IDs were not unique');
    assertCondition(first.sha256 === payloadHash, 'First SHA-256 metadata mismatch');
    assertCondition(second.sha256 === payloadHash, 'Second SHA-256 metadata mismatch');
    assertCondition(first.sizeBytes === BigInt(payload.length), 'First byte-count metadata mismatch');
    assertCondition(second.sizeBytes === BigInt(payload.length), 'Second byte-count metadata mismatch');
    assertCondition(first.malwareStatus === 'CLEAN', 'First upload was not marked CLEAN');
    assertCondition(second.malwareStatus === 'CLEAN', 'Second upload was not marked CLEAN');
    assertCondition(first.encryptionMode === 'aws:kms', `Unexpected encryption mode: ${first.encryptionMode}`);

    const head = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: versionKey,
        VersionId: second.versionId,
      }),
    );
    assertCondition(head.VersionId === second.versionId, 'S3 HeadObject returned the wrong version ID');
    assertCondition(head.ServerSideEncryption === 'aws:kms', `S3 did not report aws:kms encryption: ${head.ServerSideEncryption ?? 'missing'}`);

    heldObject = await storage.putObject({
      key: heldKey,
      body: payload,
      contentType: 'application/octet-stream',
      sourcePath,
      retentionUntil: new Date(Date.now() + 60 * 60 * 1000),
      legalHold: true,
    });
    assertCondition(heldObject.versionId, 'Object-lock upload did not return a version ID');
    assertCondition(heldObject.legalHold === true, 'Object-lock metadata did not record legal hold');

    let deleteBlocked = false;
    try {
      await storage.deleteObject(heldKey);
    } catch (error) {
      deleteBlocked = error instanceof Error && /legal hold|retention period/i.test(error.message);
    }
    assertCondition(deleteBlocked, 'Protected object deletion was not rejected');

    const records = await prisma.storageObject.findMany({
      where: { key: { in: [versionKey, heldKey] }, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    assertCondition(records.length === 3, `Expected 3 storage metadata records, received ${records.length}`);

    console.log(`clean_upload_status=PASS`);
    console.log(`versioning_status=PASS|versions=${first.versionId},${second.versionId}`);
    console.log(`sha256_status=PASS|sha256=${payloadHash}|size=${payload.length}`);
    console.log(`encryption_status=PASS|server_side_encryption=${head.ServerSideEncryption}`);
    console.log(`object_lock_status=PASS|legal_hold_delete_rejected=true`);
  } finally {
    if (heldObject?.versionId) {
      await client.send(
        new PutObjectLegalHoldCommand({
          Bucket: bucket,
          Key: heldKey,
          VersionId: heldObject.versionId,
          LegalHold: { Status: 'OFF' },
        }),
      );
      await deleteVersion(client, heldKey, heldObject.versionId, true);
    }
    for (const object of storedVersions) {
      if (object.versionId) await deleteVersion(client, versionKey, object.versionId);
    }
    await prisma.storageObject.deleteMany({ where: { key: { in: [versionKey, heldKey] } } });
    await fs.rm(sourcePath, { force: true });
  }
}

async function runFailClosedMode(storage, prisma, client) {
  const suffix = randomUUID().replaceAll('-', '');
  const payload = Buffer.from(`Mohamy Phase 1 ClamAV fail-closed evidence ${suffix}`, 'utf8');
  const sourcePath = path.join(os.tmpdir(), `mohamy-storage-fail-closed-${suffix}.bin`);
  const key = `phase1/runtime/fail-closed-${suffix}.bin`;
  await fs.writeFile(sourcePath, payload, { flag: 'wx' });
  try {
    let rejected = false;
    try {
      await storage.putObject({
        key,
        body: payload,
        contentType: 'application/octet-stream',
        sourcePath,
      });
    } catch (error) {
      rejected = error instanceof Error;
    }
    assertCondition(rejected, 'Upload was not rejected when ClamAV was unavailable');
    const records = await prisma.storageObject.count({ where: { key } });
    assertCondition(records === 0, `Fail-closed path left ${records} metadata records`);
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      throw new Error('Fail-closed path unexpectedly wrote an S3 object');
    } catch (error) {
      if (error instanceof Error && error.message === 'Fail-closed path unexpectedly wrote an S3 object') throw error;
    }
    console.log('clamav_fail_closed_status=PASS|metadata_records=0|object_written=false');
  } finally {
    await prisma.storageObject.deleteMany({ where: { key } });
    await fs.rm(sourcePath, { force: true });
  }
}

async function main() {
  assertCondition(mode === 'clean' || mode === 'fail-closed', `STORAGE_SECURITY_MODE must be clean or fail-closed, received ${mode}`);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const storage = app.get(S3ObjectStorageService);
  const prisma = app.get(PrismaService);
  const client = createS3Client();
  try {
    if (mode === 'clean') await runCleanMode(storage, prisma, client);
    else await runFailClosedMode(storage, prisma, client);
    console.log(`storage_security_result=PASS|mode=${mode}`);
  } finally {
    client.destroy();
    await app.close();
  }
}

main().catch((error) => {
  console.error(`storage_security_result=FAIL|mode=${mode}|error=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
