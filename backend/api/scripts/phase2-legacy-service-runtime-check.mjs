import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;
const require = createRequire(import.meta.url);
const { ConfigService } = require('@nestjs/config');
const { MetricsService } = require('../dist/src/observability/metrics.service.js');
const { PrismaService } = require('../dist/src/infrastructure/database/prisma.service.js');
const { IdempotencyService } = require('../dist/src/infrastructure/idempotency/idempotency.service.js');
const { OutboxService } = require('../dist/src/infrastructure/outbox/outbox.service.js');
const { QueueService } = require('../dist/src/infrastructure/queue/queue.service.js');
const { RedisService } = require('../dist/src/infrastructure/redis/redis.service.js');
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '../../..');
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalRedisUrl = process.env.REDIS_URL;
const generatedDatabase = `mohamy_phase2_services_fresh_${Date.now()}_${randomUUID().slice(0, 8)}`;

if (!originalDatabaseUrl) {
  throw new Error('DATABASE_URL is required; the verifier does not print or create credentials.');
}
if (!originalRedisUrl) {
  throw new Error('REDIS_URL is required; the verifier does not print or create credentials.');
}
if (!/^mohamy_phase2_services_fresh_[a-z0-9_]+$/.test(generatedDatabase)) {
  throw new Error('Generated database name failed the safety check.');
}
if (generatedDatabase === 'mohamy_pro') {
  throw new Error('Safety check refused to operate on mohamy_pro.');
}

const adminUrl = new URL(originalDatabaseUrl);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('schema');
const freshUrl = new URL(originalDatabaseUrl);
freshUrl.pathname = `/${generatedDatabase}`;
freshUrl.searchParams.set('schema', 'public');

let adminPool;
let databaseCreated = false;
let prisma;
let redisService;
let queueService;
const queuedJobs = [];

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error('Refusing to quote an unexpected database identifier.');
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function runMigrations() {
  execFileSync(
    'pnpm',
    ['--filter', 'api', 'exec', 'prisma', 'migrate', 'deploy'],
    {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: freshUrl.toString() },
      stdio: 'inherit',
      ...(process.platform === 'win32' ? { shell: true } : {}),
    },
  );
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

async function main() {
  adminPool = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(generatedDatabase)}`);
  databaseCreated = true;
  runMigrations();

  const config = new ConfigService({
    DATABASE_URL: freshUrl.toString(),
    METRICS_ENABLED: false,
    REDIS_URL: originalRedisUrl,
  });
  const metrics = new MetricsService(config);
  prisma = new PrismaService(config, metrics);
  redisService = new RedisService(config);
  await redisService.onModuleInit();
  queueService = new QueueService(redisService, metrics);
  await queueService.onModuleInit();
  await prisma.$connect();

  const tenantContext = {
    tenantId: randomUUID(),
    userId: randomUUID(),
    membershipId: randomUUID(),
    operationId: randomUUID(),
  };
  await prisma.tenant.create({
    data: {
      id: tenantContext.tenantId,
      slug: `services-${randomUUID().slice(0, 8)}`,
      name: 'Disposable Service Runtime Tenant',
      status: 'ACTIVE',
    },
  });
  await prisma.user.create({
    data: { id: tenantContext.userId, status: 'ACTIVE' },
  });
  await prisma.withTenantContext(tenantContext, (transaction) =>
    transaction.membership.create({
      data: {
        id: tenantContext.membershipId,
        tenantId: tenantContext.tenantId,
        userId: tenantContext.userId,
        status: 'ACTIVE',
        activeFrom: new Date(),
      },
    }),
  );

  const idempotency = new IdempotencyService(prisma);
  const request = {
    key: randomUUID(),
    method: 'POST',
    path: '/api/v1/legacy-runtime',
    contentType: 'application/json',
    body: { value: 'first' },
  };
  const scope = { kind: 'TENANT', tenantContext };
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const first = await idempotency.register({ request, scope, expiresAt });
  requireEqual(first.kind, 'RESERVED', 'first idempotency reservation');
  const inProgress = await idempotency.register({ request, scope, expiresAt });
  requireEqual(inProgress.kind, 'IN_PROGRESS', 'active idempotency reservation');
  await idempotency.complete(request, scope, {
    responseStatus: 201,
    responseBody: { success: true, data: { id: randomUUID() } },
  });
  const replay = await idempotency.findValid(request, scope);
  requireEqual(replay?.kind, 'REPLAY', 'completed idempotency replay');
  const conflict = await idempotency.findValid(
    { ...request, body: { value: 'changed' } },
    scope,
  );
  requireEqual(conflict?.kind, 'CONFLICT', 'changed-body idempotency conflict');
  console.log('legacy_service_idempotency_status=PASS|first=RESERVED|in_progress=IN_PROGRESS|replay=REPLAY|conflict=CONFLICT');

  const queue = {
    enqueue: async (name, payload, options) => {
      const job = await queueService.enqueue(name, payload, options);
      queuedJobs.push(job);
      return job;
    },
  };
  const outbox = new OutboxService(prisma, queue, metrics);
  const created = await prisma.withTenantContext(tenantContext, (transaction) =>
    outbox.create(
      {
        scope: 'TENANT',
        tenantContext,
        aggregateType: 'LegacyRuntime',
        aggregateId: randomUUID(),
        eventType: 'legacy.runtime.tenant',
        payload: { tenantId: tenantContext.tenantId },
      },
      transaction,
    ),
  );
  const dispatched = await outbox.dispatchBatch();
  requireEqual(dispatched, 1, 'tenant outbox dispatch count');
  requireEqual(queuedJobs.length, 1, 'tenant outbox queued count');
  requireEqual(queuedJobs[0].data.scope, 'TENANT', 'tenant outbox job scope');
  requireEqual(queuedJobs[0].data.tenantId, tenantContext.tenantId, 'tenant outbox job tenant');
  const leased = await prisma.withOutboxDispatcherContext(
    randomUUID(),
    (transaction) =>
      transaction.outboxMessage.findUnique({ where: { id: created.id } }),
  );
  if (!leased?.leaseToken) throw new Error('Tenant outbox row was not leased');
  const processed = await outbox.markProcessed(created.id, leased.leaseToken);
  requireEqual(processed, true, 'tenant outbox processed state');
  const persisted = await prisma.withTenantContext(tenantContext, (transaction) =>
    transaction.outboxMessage.findUnique({ where: { id: created.id } }),
  );
  requireEqual(persisted?.status, 'PROCESSED', 'tenant outbox persisted status');
  console.log(`legacy_service_outbox_status=PASS|created=1|queued=${queuedJobs.length}|processed=1|scope=${queuedJobs[0].data.scope}`);

  await prisma.withOutboxDispatcherContext(randomUUID(), (transaction) =>
    transaction.outboxMessage.delete({ where: { id: created.id } }),
  );
  await idempotency.purgeExpired(new Date(Date.now() + 2 * 60 * 60 * 1000));
  await prisma.withTenantContext(tenantContext, (transaction) =>
    transaction.membership.delete({ where: { id: tenantContext.membershipId } }),
  );
  await prisma.user.delete({ where: { id: tenantContext.userId } });
  await prisma.tenant.delete({ where: { id: tenantContext.tenantId } });
  console.log('legacy_service_cleanup_status=PASS|business_rows_removed=true');
}

try {
  await main();
  console.log(`legacy_service_runtime_result=PASS|database=${generatedDatabase}`);
} catch (error) {
  console.error(`legacy_service_runtime_result=FAIL|error=${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
} finally {
  for (const job of queuedJobs) await job.remove().catch(() => undefined);
  if (queueService) await queueService.onModuleDestroy().catch(() => undefined);
  if (redisService) await redisService.onModuleDestroy().catch(() => undefined);
  if (prisma) await prisma.$disconnect().catch(() => undefined);
  if (adminPool) {
    if (databaseCreated) {
      await adminPool.query(`DROP DATABASE ${quoteIdentifier(generatedDatabase)}`).catch((error) => {
        console.error(`legacy_service_cleanup_result=FAIL|error=${error instanceof Error ? error.message : 'unknown error'}`);
        process.exitCode = 1;
      });
    }
    await adminPool.end().catch(() => undefined);
  }
  if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalRedisUrl) process.env.REDIS_URL = originalRedisUrl;
}
