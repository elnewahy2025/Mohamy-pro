import { randomUUID } from 'node:crypto';
import pg from 'pg';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';

const { Client } = pg;
const queueName = 'mohamy-application';
const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
const timeoutMs = 45_000;

function required(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(label, read, predicate, timeout = timeoutMs) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (predicate(value)) return value;
    await sleep(500);
  } while (Date.now() < deadline);
  throw new Error(`${label} timed out with state ${JSON.stringify(value)}`);
}

function redisConnection(url) {
  const parsed = new URL(required('REDIS_URL', url));
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
  };
}

async function readOutbox(client, id) {
  const result = await client.query(
    `SELECT "status", "attempts", "availableAt", "claimedAt", "leaseToken", "error", "processedAt",
            EXTRACT(EPOCH FROM ("availableAt" - CURRENT_TIMESTAMP)) * 1000 AS "availableDelayMs"
     FROM "OutboxMessage" WHERE "id" = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

async function main() {
  const database = new Client({ connectionString: required('DATABASE_URL', databaseUrl) });
  const redis = new IORedis(redisConnection(redisUrl));
  const queue = new Queue(queueName, { connection: redisConnection(redisUrl) });
  const testIds = [];
  const jobIds = [];

  try {
    await database.connect();
    await redis.ping();

    const retryId = `phase1-retry-${randomUUID().replaceAll('-', '')}`;
    const retryEvent = `phase1.runtime.retry.${randomUUID().replaceAll('-', '')}`;
    testIds.push(retryId);
    await database.query(
      `INSERT INTO "OutboxMessage" ("id", "aggregateType", "aggregateId", "eventType", "payload", "status", "availableAt", "attempts")
       VALUES ($1, 'Phase1Advanced', $2, $3, $4::jsonb, 'PENDING', CURRENT_TIMESTAMP, 0)`,
      [retryId, retryId, retryEvent, JSON.stringify({ test: 'retry-backoff' })],
    );
    const firstFailure = await waitFor(
      'retry failure',
      () => readOutbox(database, retryId),
      (row) => row?.status === 'FAILED' && row.attempts === 1,
    );
    const retryDelayMs = Number(firstFailure.availableDelayMs);
    if (!Number.isFinite(retryDelayMs) || retryDelayMs <= 0) {
      throw new Error(
        `Retry failure did not schedule a future availableAt time; availableAt=${String(firstFailure.availableAt)} availableDelayMs=${String(firstFailure.availableDelayMs)} status=${firstFailure.status} attempts=${firstFailure.attempts}`,
      );
    }
    const secondFailure = await waitFor(
      'retry second attempt',
      () => readOutbox(database, retryId),
      (row) => row?.attempts >= 2 && (row.status === 'FAILED' || row.status === 'DEAD_LETTER'),
    );

    const leaseId = `phase1-lease-${randomUUID().replaceAll('-', '')}`;
    const expiredToken = `expired-${randomUUID().replaceAll('-', '')}`;
    const leaseEvent = `phase1.runtime.lease.${randomUUID().replaceAll('-', '')}`;
    testIds.push(leaseId);
    await database.query(
      `INSERT INTO "OutboxMessage" ("id", "aggregateType", "aggregateId", "eventType", "payload", "status", "availableAt", "attempts", "claimedAt", "leaseToken")
       VALUES ($1, 'Phase1Advanced', $2, $3, $4::jsonb, 'PROCESSING', CURRENT_TIMESTAMP - INTERVAL '2 minutes', 1, CURRENT_TIMESTAMP - INTERVAL '2 minutes', $5)`,
      [leaseId, leaseId, leaseEvent, JSON.stringify({ test: 'lease-expiry' }), expiredToken],
    );
    const reclaimed = await waitFor(
      'expired lease reclamation',
      () => readOutbox(database, leaseId),
      (row) => row?.attempts >= 2 && row.status === 'PROCESSING' && row.leaseToken && row.leaseToken !== expiredToken,
    );
    const leaseFinal = await waitFor(
      'expired lease retry result',
      () => readOutbox(database, leaseId),
      (row) => row?.attempts >= 2 && (row.status === 'FAILED' || row.status === 'DEAD_LETTER'),
    );

    const duplicateId = `phase1-duplicate-${randomUUID().replaceAll('-', '')}`;
    testIds.push(duplicateId);
    await database.query(
      `INSERT INTO "OutboxMessage" ("id", "aggregateType", "aggregateId", "eventType", "payload", "status", "attempts", "processedAt")
       VALUES ($1, 'Phase1Advanced', $1, $2, $3::jsonb, 'PROCESSED', 1, CURRENT_TIMESTAMP)`,
      [duplicateId, `phase1.runtime.duplicate.${randomUUID().replaceAll('-', '')}`, JSON.stringify({ test: 'duplicate-delivery' })],
    );
    for (const suffix of ['a', 'b']) {
      const jobId = `phase1-duplicate-${duplicateId}-${suffix}`;
      jobIds.push(jobId);
      await queue.add(
        'outbox.dispatch',
        { outboxMessageId: duplicateId, attempt: 2 },
        { jobId },
      );
    }
    const duplicateJobs = await waitFor(
      'duplicate jobs completion',
      async () => {
        const states = [];
        for (const jobId of jobIds) {
          const job = await queue.getJob(jobId);
          states.push(job ? await job.getState() : 'missing');
        }
        return states;
      },
      (states) => states.length === 2 && states.every((state) => state === 'completed'),
    );
    const duplicateFinal = await readOutbox(database, duplicateId);
    if (duplicateFinal?.status !== 'PROCESSED' || duplicateFinal.attempts !== 1) {
      throw new Error(`Duplicate delivery changed processed state: ${JSON.stringify(duplicateFinal)}`);
    }

    console.log(`retry_backoff_status=PASS|first_available_at_future=true|delay_ms=${Math.round(retryDelayMs)}|second_attempts=${secondFailure.attempts}`);
    console.log(`lease_expiry_status=PASS|reclaimed_attempts=${reclaimed.attempts}|final_status=${leaseFinal.status}`);
    console.log(`duplicate_delivery_status=PASS|job_states=${duplicateJobs.join(',')}|processed_attempts=${duplicateFinal.attempts}`);
  } finally {
    for (const jobId of jobIds) {
      const job = await queue.getJob(jobId);
      if (job) await job.remove().catch(() => undefined);
    }
    if (testIds.length > 0) {
      await database.query(
        `DELETE FROM "OutboxMessage" WHERE "id" = ANY($1::text[])`,
        [testIds],
      );
    }
    const remaining = await database.query(
      `SELECT count(*)::int AS count FROM "OutboxMessage" WHERE "id" = ANY($1::text[])`,
      [testIds],
    );
    console.log(`outbox_cleanup_remaining=${remaining.rows[0]?.count ?? 'unknown'}`);
    await queue.close();
    await redis.quit();
    await database.end();
  }
}

main()
  .then(() => {
    console.log('outbox_advanced_result=PASS');
  })
  .catch((error) => {
    console.error(`outbox_advanced_result=FAIL|error=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
