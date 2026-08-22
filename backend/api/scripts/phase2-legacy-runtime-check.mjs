import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '../../..');
const originalDatabaseUrl = process.env.DATABASE_URL;
const generatedDatabase = `mohamy_phase2_legacy_fresh_${Date.now()}_${randomUUID().slice(0, 8)}`;
const verifierRole = `mohamy_phase2_legacy_verifier_${randomUUID().slice(0, 8)}`;
const legacyTables = ['StorageObject', 'OutboxMessage', 'IdempotencyKey'];
const expectedPolicies = {
  StorageObject: 1,
  OutboxMessage: 4,
  IdempotencyKey: 7,
};

if (!originalDatabaseUrl) {
  throw new Error(
    'DATABASE_URL is required in the local PowerShell session; the verifier does not print or create credentials.',
  );
}
if (!/^mohamy_phase2_legacy_fresh_[a-z0-9_]+$/.test(generatedDatabase)) {
  throw new Error('Generated database name failed the safety check.');
}
if (!/^mohamy_phase2_legacy_verifier_[a-z0-9_]+$/.test(verifierRole)) {
  throw new Error('Generated verifier role name failed the safety check.');
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
let ownerPool;
let verifierPool;
let verifierRoleCreated = false;
let databaseCreated = false;

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error('Refusing to quote an unexpected database identifier.');
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function requireTrue(value, label) {
  if (!value) throw new Error(`${label}: expected true`);
}

function countFrom(result) {
  return Number(result.rows[0]?.count ?? -1);
}

function requireRlsError(error, label) {
  if (error?.code !== '42501') {
    throw new Error(
      `${label}: expected PostgreSQL row-security error 42501, received ${error?.code ?? 'unknown'}`,
    );
  }
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

async function setTransactionSettings(client, settings) {
  await client.query(
    `SELECT
       set_config('app.tenant_id', $1, true),
       set_config('app.user_id', $2, true),
       set_config('app.membership_id', $3, true),
       set_config('app.operation_id', $4, true),
       set_config('app.global_operation', $5, true),
       set_config('app.outbox_dispatcher', $6, true),
       set_config('app.idempotency_maintenance', $7, true)`,
    [
      settings.tenantId ?? '',
      settings.userId ?? '',
      settings.membershipId ?? '',
      settings.operationId,
      String(settings.globalOperation ?? false),
      String(settings.outboxDispatcher ?? false),
      String(settings.idempotencyMaintenance ?? false),
    ],
  );
}

async function inSettings(client, settings, callback) {
  await client.query('BEGIN');
  try {
    await setTransactionSettings(client, settings);
    const result = await callback();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function requireClearedContext(client, label) {
  const result = await client.query(
    `SELECT
       NULLIF(current_setting('app.tenant_id', true), '') AS tenant_id,
       NULLIF(current_setting('app.user_id', true), '') AS user_id,
       NULLIF(current_setting('app.membership_id', true), '') AS membership_id,
       NULLIF(current_setting('app.operation_id', true), '') AS operation_id,
       NULLIF(current_setting('app.global_operation', true), '') AS global_operation,
       NULLIF(current_setting('app.outbox_dispatcher', true), '') AS outbox_dispatcher,
       NULLIF(current_setting('app.idempotency_maintenance', true), '') AS idempotency_maintenance`,
  );
  const leaked = Object.entries(result.rows[0] ?? {}).find(
    ([, value]) => value !== null,
  );
  if (leaked) {
    throw new Error(`${label}: context leaked through ${leaked[0]}`);
  }
}

async function configureVerifierRole() {
  const verifierPassword = `${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`;
  await adminPool.query(
    `CREATE ROLE ${quoteIdentifier(verifierRole)} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${quoteLiteral(verifierPassword)}`,
  );
  verifierRoleCreated = true;
  await adminPool.query(
    `GRANT CONNECT ON DATABASE ${quoteIdentifier(generatedDatabase)} TO ${quoteIdentifier(verifierRole)}`,
  );
  await ownerPool.query(
    `GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(verifierRole)}`,
  );
  await ownerPool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${legacyTables.map(quoteIdentifier).join(', ')} TO ${quoteIdentifier(verifierRole)}`,
  );
  await ownerPool.query(
    `GRANT EXECUTE ON FUNCTION public.app_tenant_context_is_valid(), public.app_global_operation_context_is_valid(), public.app_outbox_dispatch_context_is_valid(), public.app_idempotency_maintenance_context_is_valid() TO ${quoteIdentifier(verifierRole)}`,
  );
  await ownerPool.end();
  ownerPool = undefined;
  const verifierUrl = new URL(freshUrl.toString());
  verifierUrl.username = verifierRole;
  verifierUrl.password = verifierPassword;
  verifierPool = new Pool({ connectionString: verifierUrl.toString(), max: 2 });
  await verifierPool.query('SELECT 1');
  const roleState = await verifierPool.query(
    `SELECT current_user, session_user, rolsuper, rolbypassrls
     FROM pg_roles WHERE rolname = current_user`,
  );
  const role = roleState.rows[0];
  if (
    role?.current_user !== verifierRole ||
    role.session_user !== verifierRole ||
    role.rolsuper !== false ||
    role.rolbypassrls !== false
  ) {
    throw new Error('Legacy verifier connection did not use a LOGIN NOSUPERUSER NOBYPASSRLS role');
  }
  console.log('legacy_runtime_role_status=PASS|superuser=false|bypassrls=false');
}

async function verifyMetadata() {
  const result = await verifierPool.query(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, count(p.polname)::int AS policy_count
     FROM pg_class AS c
     LEFT JOIN pg_policy AS p ON p.polrelid = c.oid
     WHERE c.relname = ANY($1::text[])
     GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
     ORDER BY c.relname`,
    [legacyTables],
  );
  requireEqual(result.rows.length, legacyTables.length, 'legacy RLS table count');
  for (const row of result.rows) {
    requireTrue(row.relrowsecurity, `${row.relname} RLS enabled`);
    requireTrue(row.relforcerowsecurity, `${row.relname} RLS forced`);
    requireEqual(row.policy_count, expectedPolicies[row.relname], `${row.relname} policy count`);
  }
  const policyCount = result.rows.reduce((sum, row) => sum + Number(row.policy_count), 0);
  console.log(`legacy_metadata_status=PASS|tables=${result.rows.length}|policies=${policyCount}`);
}

async function seedFixtures() {
  const tenantA = { id: randomUUID(), slug: `legacy-a-${randomUUID().slice(0, 8)}` };
  const tenantB = { id: randomUUID(), slug: `legacy-b-${randomUUID().slice(0, 8)}` };
  const userA = randomUUID();
  const userB = randomUUID();
  const membershipA = randomUUID();
  const membershipB = randomUUID();
  const operationA = randomUUID();
  const operationB = randomUUID();
  const objectA = randomUUID();
  const objectB = randomUUID();
  const outboxA = randomUUID();
  const outboxB = randomUUID();
  const globalOutbox = randomUUID();
  const idempotencyA = randomUUID();
  const idempotencyB = randomUUID();
  const globalIdempotency = randomUUID();
  const keyA = randomUUID();
  const keyB = randomUUID();
  const globalKey = randomUUID();

  await ownerPool.query(
    `INSERT INTO "Tenant" ("id", "slug", "name", "status", "updatedAt")
     VALUES ($1, $2, 'Legacy Tenant A', 'ACTIVE', CURRENT_TIMESTAMP),
            ($3, $4, 'Legacy Tenant B', 'ACTIVE', CURRENT_TIMESTAMP)`,
    [tenantA.id, tenantA.slug, tenantB.id, tenantB.slug],
  );
  const contexts = {
    a: { tenantId: tenantA.id, userId: userA, membershipId: membershipA, operationId: operationA },
    b: { tenantId: tenantB.id, userId: userB, membershipId: membershipB, operationId: operationB },
  };
  await ownerPool.query(
    `INSERT INTO "User" ("id", "status", "updatedAt")
     VALUES ($1, 'ACTIVE', CURRENT_TIMESTAMP), ($2, 'ACTIVE', CURRENT_TIMESTAMP)`,
    [userA, userB],
  );
  await inSettings(ownerPool, contexts.a, async () => {
    await ownerPool.query(
      `INSERT INTO "Membership" ("id", "tenantId", "userId", "status", "activeFrom", "updatedAt")
       VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [membershipA, tenantA.id, userA],
    );
    await ownerPool.query(
      `INSERT INTO "StorageObject" ("id", "tenantId", "key", "sha256", "sizeBytes", "contentType", "encryptionMode", "malwareStatus")
       VALUES ($1, $2, $3, repeat('a', 64), 1, 'text/plain', 'NONE', 'CLEAN')`,
      [objectA, tenantA.id, `tenants/${tenantA.id}/a.txt`],
    );
    await ownerPool.query(
      `INSERT INTO "OutboxMessage" ("id", "tenantId", "scope", "aggregateType", "aggregateId", "eventType", "eventVersion", "payload", "contextUserId", "contextMembershipId", "operationId")
       VALUES ($1, $2, 'TENANT', 'Legacy', $1, 'legacy.tenant.a', 1, '{"tenant":"a"}', $3, $4, $5)`,
      [outboxA, tenantA.id, userA, membershipA, operationA],
    );
    await ownerPool.query(
      `INSERT INTO "IdempotencyKey" ("id", "key", "actorScope", "tenantScope", "userId", "tenantId", "httpMethod", "requestPath", "requestFingerprint", "state", "responseStatus", "responseBody", "reservationVersion", "expiresAt")
       VALUES ($1, $2, $3, $4, $3, $4, 'POST', '/api/v1/legacy/a', repeat('c', 64), 'COMPLETED', 201, '{"success":true}', 1, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [idempotencyA, keyA, userA, tenantA.id],
    );
  });
  await inSettings(ownerPool, contexts.b, async () => {
    await ownerPool.query(
      `INSERT INTO "Membership" ("id", "tenantId", "userId", "status", "activeFrom", "updatedAt")
       VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [membershipB, tenantB.id, userB],
    );
    await ownerPool.query(
      `INSERT INTO "StorageObject" ("id", "tenantId", "key", "sha256", "sizeBytes", "contentType", "encryptionMode", "malwareStatus")
       VALUES ($1, $2, $3, repeat('b', 64), 1, 'text/plain', 'NONE', 'CLEAN')`,
      [objectB, tenantB.id, `tenants/${tenantB.id}/b.txt`],
    );
    await ownerPool.query(
      `INSERT INTO "OutboxMessage" ("id", "tenantId", "scope", "aggregateType", "aggregateId", "eventType", "eventVersion", "payload", "contextUserId", "contextMembershipId", "operationId")
       VALUES ($1, $2, 'TENANT', 'Legacy', $1, 'legacy.tenant.b', 1, '{"tenant":"b"}', $3, $4, $5)`,
      [outboxB, tenantB.id, userB, membershipB, operationB],
    );
    await ownerPool.query(
      `INSERT INTO "IdempotencyKey" ("id", "key", "actorScope", "tenantScope", "userId", "tenantId", "httpMethod", "requestPath", "requestFingerprint", "state", "responseStatus", "responseBody", "reservationVersion", "expiresAt")
       VALUES ($1, $2, $3, $4, $3, $4, 'POST', '/api/v1/legacy/b', repeat('d', 64), 'COMPLETED', 201, '{"success":true}', 1, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [idempotencyB, keyB, userB, tenantB.id],
    );
  });
  await inSettings(ownerPool, { operationId: randomUUID(), globalOperation: true }, async () => {
    await ownerPool.query(
      `INSERT INTO "OutboxMessage" ("id", "tenantId", "scope", "aggregateType", "aggregateId", "eventType", "eventVersion", "payload")
       VALUES ($1, NULL, 'GLOBAL', 'Health', $1, 'health.status.updated', 1, '{"global":true}')`,
      [globalOutbox],
    );
    await ownerPool.query(
      `INSERT INTO "IdempotencyKey" ("id", "key", "actorScope", "tenantScope", "httpMethod", "requestPath", "requestFingerprint", "state", "responseStatus", "responseBody", "reservationVersion", "expiresAt")
       VALUES ($1, $2, 'service:legacy', 'GLOBAL', 'POST', '/api/v1/legacy/global', repeat('e', 64), 'COMPLETED', 200, '{"success":true}', 1, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [globalIdempotency, globalKey],
    );
  });
  return {
    tenantA,
    tenantB,
    contexts,
    ids: { objectA, objectB, outboxA, outboxB, globalOutbox, idempotencyA, idempotencyB, globalIdempotency },
  };
}

async function verifyDefaultDeny(fixtures) {
  for (const table of legacyTables) {
    const result = await verifierPool.query(`SELECT count(*)::int AS count FROM ${quoteIdentifier(table)}`);
    requireEqual(countFrom(result), 0, `no-context ${table} visibility`);
  }
  const denied = [];
  const noContextClient = await verifierPool.connect();
  try {
    const statements = [
      ['StorageObject', `INSERT INTO "StorageObject" ("id", "tenantId", "key", "sha256", "sizeBytes", "contentType", "encryptionMode", "malwareStatus") VALUES ($1, $2, $3, repeat('f', 64), 1, 'text/plain', 'NONE', 'CLEAN')`, [randomUUID(), fixtures.tenantA.id, `tenants/${fixtures.tenantA.id}/blocked.txt`]],
      ['OutboxMessage', `INSERT INTO "OutboxMessage" ("id", "tenantId", "scope", "aggregateType", "aggregateId", "eventType", "eventVersion", "payload", "contextUserId", "contextMembershipId", "operationId") VALUES ($1, $2, 'TENANT', 'Legacy', $1, 'legacy.blocked', 1, '{}', $3, $4, $5)`, [randomUUID(), fixtures.tenantA.id, fixtures.contexts.a.userId, fixtures.contexts.a.membershipId, fixtures.contexts.a.operationId]],
      ['IdempotencyKey', `INSERT INTO "IdempotencyKey" ("id", "key", "actorScope", "tenantScope", "userId", "tenantId", "httpMethod", "requestPath", "requestFingerprint", "state", "expiresAt") VALUES ($1, $2, $3, $4, $3, $4, 'POST', '/blocked', repeat('f', 64), 'RESERVED', CURRENT_TIMESTAMP + INTERVAL '1 hour')`, [randomUUID(), randomUUID(), fixtures.contexts.a.userId, fixtures.tenantA.id]],
    ];
    for (const [table, sql, values] of statements) {
      try {
        await noContextClient.query(sql, values);
        throw new Error(`no-context ${table} insert unexpectedly succeeded`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('unexpectedly succeeded')) throw error;
        requireRlsError(error, `no-context ${table} insert`);
        denied.push(table);
      }
    }
  } finally {
    noContextClient.release();
  }
  requireEqual(denied.length, 3, 'no-context denied insert count');
  const ordinaryDeleteClient = await verifierPool.connect();
  try {
    try {
      await inSettings(
        ordinaryDeleteClient,
        fixtures.contexts.a,
        () =>
          ordinaryDeleteClient.query(
            'DELETE FROM "IdempotencyKey" WHERE "tenantId" = $1',
            [fixtures.tenantA.id],
          ),
      );
      throw new Error('ordinary idempotency delete unexpectedly succeeded');
    } catch (error) {
      if (error instanceof Error && error.message.includes('unexpectedly succeeded')) throw error;
      requireRlsError(error, 'ordinary idempotency delete');
    }
  } finally {
    ordinaryDeleteClient.release();
  }
  console.log('legacy_default_deny_status=PASS|storage_read=0|outbox_read=0|idempotency_read=0|insert_denied=true|ordinary_idempotency_delete_denied=true');
}

async function verifyTenantIsolation(fixtures) {
  const client = await verifierPool.connect();
  try {
    const a = await inSettings(client, fixtures.contexts.a, async () => ({
      storageOwn: countFrom(await client.query('SELECT count(*)::int AS count FROM "StorageObject" WHERE "tenantId" = $1', [fixtures.tenantA.id])),
      storageOther: countFrom(await client.query('SELECT count(*)::int AS count FROM "StorageObject" WHERE "tenantId" = $1', [fixtures.tenantB.id])),
      outboxOwn: countFrom(await client.query('SELECT count(*)::int AS count FROM "OutboxMessage" WHERE "tenantId" = $1', [fixtures.tenantA.id])),
      outboxOther: countFrom(await client.query('SELECT count(*)::int AS count FROM "OutboxMessage" WHERE "tenantId" = $1', [fixtures.tenantB.id])),
      idempotencyOwn: countFrom(await client.query('SELECT count(*)::int AS count FROM "IdempotencyKey" WHERE "tenantId" = $1', [fixtures.tenantA.id])),
      idempotencyOther: countFrom(await client.query('SELECT count(*)::int AS count FROM "IdempotencyKey" WHERE "tenantId" = $1', [fixtures.tenantB.id])),
    }));
    requireEqual(a.storageOwn, 1, 'Tenant A storage own visibility');
    requireEqual(a.storageOther, 0, 'Tenant A storage other visibility');
    requireEqual(a.outboxOwn, 1, 'Tenant A outbox own visibility');
    requireEqual(a.outboxOther, 0, 'Tenant A outbox other visibility');
    requireEqual(a.idempotencyOwn, 1, 'Tenant A idempotency own visibility');
    requireEqual(a.idempotencyOther, 0, 'Tenant A idempotency other visibility');

    const b = await inSettings(client, fixtures.contexts.b, async () => ({
      storageOwn: countFrom(await client.query('SELECT count(*)::int AS count FROM "StorageObject" WHERE "tenantId" = $1', [fixtures.tenantB.id])),
      storageOther: countFrom(await client.query('SELECT count(*)::int AS count FROM "StorageObject" WHERE "tenantId" = $1', [fixtures.tenantA.id])),
      outboxOwn: countFrom(await client.query('SELECT count(*)::int AS count FROM "OutboxMessage" WHERE "tenantId" = $1', [fixtures.tenantB.id])),
      outboxOther: countFrom(await client.query('SELECT count(*)::int AS count FROM "OutboxMessage" WHERE "tenantId" = $1', [fixtures.tenantA.id])),
      idempotencyOwn: countFrom(await client.query('SELECT count(*)::int AS count FROM "IdempotencyKey" WHERE "tenantId" = $1', [fixtures.tenantB.id])),
      idempotencyOther: countFrom(await client.query('SELECT count(*)::int AS count FROM "IdempotencyKey" WHERE "tenantId" = $1', [fixtures.tenantA.id])),
    }));
    requireEqual(b.storageOwn, 1, 'Tenant B storage own visibility');
    requireEqual(b.storageOther, 0, 'Tenant B storage other visibility');
    requireEqual(b.outboxOwn, 1, 'Tenant B outbox own visibility');
    requireEqual(b.outboxOther, 0, 'Tenant B outbox other visibility');
    requireEqual(b.idempotencyOwn, 1, 'Tenant B idempotency own visibility');
    requireEqual(b.idempotencyOther, 0, 'Tenant B idempotency other visibility');
  } finally {
    client.release();
  }
  console.log('legacy_tenant_isolation_status=PASS|tenant_a_own=1|tenant_a_sees_b=0|tenant_b_sees_a=0');
}

async function verifyCrossTenantWrites(fixtures) {
  const client = await verifierPool.connect();
  const rejected = [];
  try {
    const attempts = [
        ['StorageObject', `INSERT INTO "StorageObject" ("id", "tenantId", "key", "sha256", "sizeBytes", "contentType", "encryptionMode", "malwareStatus") VALUES ($1, $2, $3, repeat('f', 64), 1, 'text/plain', 'NONE', 'CLEAN')`, [randomUUID(), fixtures.tenantB.id, `tenants/${fixtures.tenantB.id}/cross.txt`]],
        ['OutboxMessage', `INSERT INTO "OutboxMessage" ("id", "tenantId", "scope", "aggregateType", "aggregateId", "eventType", "eventVersion", "payload", "contextUserId", "contextMembershipId", "operationId") VALUES ($1, $2, 'TENANT', 'Legacy', $1, 'legacy.cross', 1, '{}', $3, $4, $5)`, [randomUUID(), fixtures.tenantB.id, fixtures.contexts.a.userId, fixtures.contexts.a.membershipId, fixtures.contexts.a.operationId]],
        ['IdempotencyKey', `INSERT INTO "IdempotencyKey" ("id", "key", "actorScope", "tenantScope", "userId", "tenantId", "httpMethod", "requestPath", "requestFingerprint", "state", "expiresAt") VALUES ($1, $2, $3, $4, $3, $4, 'POST', '/cross', repeat('f', 64), 'RESERVED', CURRENT_TIMESTAMP + INTERVAL '1 hour')`, [randomUUID(), randomUUID(), fixtures.contexts.a.userId, fixtures.tenantB.id]],
    ];
    for (const [table, sql, values] of attempts) {
      try {
        await inSettings(client, fixtures.contexts.a, async () =>
          client.query(sql, values),
        );
        throw new Error(`${table} cross-tenant insert unexpectedly succeeded`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('unexpectedly succeeded')) throw error;
        requireRlsError(error, `${table} cross-tenant insert`);
        rejected.push(table);
      }
    }
  } finally {
    client.release();
  }
  requireEqual(rejected.length, 3, 'cross-tenant rejection count');
  console.log('legacy_cross_tenant_write_status=PASS|storage=DENIED|outbox=DENIED|idempotency=DENIED');
}

async function verifyGlobalAndDispatcherScopes(fixtures) {
  const globalClient = await verifierPool.connect();
  try {
    const global = await inSettings(globalClient, {
      operationId: randomUUID(),
      globalOperation: true,
    }, async () => ({
      outbox: countFrom(await globalClient.query('SELECT count(*)::int AS count FROM "OutboxMessage" WHERE "scope" = \'GLOBAL\'')),
      idempotency: countFrom(await globalClient.query('SELECT count(*)::int AS count FROM "IdempotencyKey" WHERE "tenantScope" = \'GLOBAL\'')),
      storage: countFrom(await globalClient.query('SELECT count(*)::int AS count FROM "StorageObject"')),
    }));
    requireEqual(global.outbox, 1, 'global outbox visibility');
    requireEqual(global.idempotency, 1, 'global idempotency visibility');
    requireEqual(global.storage, 0, 'global storage visibility');

    const dispatched = await inSettings(globalClient, {
      operationId: randomUUID(),
      outboxDispatcher: true,
    }, async () => countFrom(await globalClient.query('SELECT count(*)::int AS count FROM "OutboxMessage"')));
    requireEqual(dispatched, 3, 'dispatcher outbox visibility');
  } finally {
    globalClient.release();
  }
  console.log('legacy_scope_status=PASS|global_outbox=1|global_idempotency=1|global_storage=0|dispatcher_outbox=3');
  void fixtures;
}

async function verifyRollbackAndPoolReuse(fixtures) {
  const rollbackClient = await verifierPool.connect();
  try {
    try {
      await inSettings(rollbackClient, fixtures.contexts.a, async () => {
        await rollbackClient.query(
          `INSERT INTO "StorageObject" ("id", "tenantId", "key", "sha256", "sizeBytes", "contentType", "encryptionMode", "malwareStatus") VALUES ($1, $2, $3, repeat('f', 64), 1, 'text/plain', 'NONE', 'CLEAN')`,
          [randomUUID(), fixtures.tenantA.id, `tenants/${fixtures.tenantA.id}/rollback.txt`],
        );
        throw new Error('intentional legacy rollback verification failure');
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'intentional legacy rollback verification failure') throw error;
    }
    await requireClearedContext(rollbackClient, 'legacy context after rollback');
    const noContext = await rollbackClient.query(`SELECT count(*)::int AS count FROM "StorageObject"`);
    requireEqual(countFrom(noContext), 0, 'no-context storage after rollback');
    const after = await inSettings(rollbackClient, fixtures.contexts.a, async () =>
      countFrom(await rollbackClient.query('SELECT count(*)::int AS count FROM "StorageObject" WHERE "tenantId" = $1', [fixtures.tenantA.id])),
    );
    requireEqual(after, 1, 'rollback preserved only original Tenant A storage row');
  } finally {
    rollbackClient.release();
  }

  const poolClient = await verifierPool.connect();
  try {
    await inSettings(poolClient, fixtures.contexts.a, async () => {
      const own = await poolClient.query('SELECT count(*)::int AS count FROM "StorageObject" WHERE "tenantId" = $1', [fixtures.tenantA.id]);
      requireEqual(countFrom(own), 1, 'pooled Tenant A read');
    });
    await requireClearedContext(poolClient, 'legacy context after Tenant A commit');
  } finally {
    poolClient.release();
  }

  const reusedClient = await verifierPool.connect();
  try {
    await requireClearedContext(reusedClient, 'legacy context through pool reuse before Tenant B');
    const tenantB = await inSettings(reusedClient, fixtures.contexts.b, async () => ({
      own: countFrom(await reusedClient.query('SELECT count(*)::int AS count FROM "StorageObject" WHERE "tenantId" = $1', [fixtures.tenantB.id])),
      other: countFrom(await reusedClient.query('SELECT count(*)::int AS count FROM "StorageObject" WHERE "tenantId" = $1', [fixtures.tenantA.id])),
    }));
    requireEqual(tenantB.own, 1, 'pooled Tenant B read');
    requireEqual(tenantB.other, 0, 'pooled Tenant B cannot read Tenant A');
    await requireClearedContext(reusedClient, 'legacy context after Tenant B commit');
  } finally {
    reusedClient.release();
  }
  console.log('legacy_rollback_status=PASS|rolled_back_storage_rows=0|post_rollback_no_context_rows=0');
  console.log('legacy_pool_reuse_status=PASS|tenant_a_to_b_context_reset=true|tenant_b_sees_a=0');
}

async function main() {
  adminPool = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(generatedDatabase)}`);
  databaseCreated = true;
  runMigrations();
  ownerPool = new Pool({ connectionString: freshUrl.toString(), max: 1 });
  await ownerPool.query('SELECT 1');
  const fixtures = await seedFixtures();
  await configureVerifierRole();
  await verifyMetadata();
  await verifyDefaultDeny(fixtures);
  await verifyTenantIsolation(fixtures);
  await verifyCrossTenantWrites(fixtures);
  await verifyGlobalAndDispatcherScopes(fixtures);
  await verifyRollbackAndPoolReuse(fixtures);
  console.log(`legacy_runtime_result=PASS|database=${generatedDatabase}`);
}

try {
  await main();
} catch (error) {
  console.error(`legacy_runtime_result=FAIL|error=${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
} finally {
  if (verifierPool) await verifierPool.end().catch(() => undefined);
  if (ownerPool) await ownerPool.end().catch(() => undefined);
  if (adminPool) {
    if (databaseCreated) {
      await adminPool.query(`DROP DATABASE ${quoteIdentifier(generatedDatabase)}`).catch((error) => {
        console.error(`legacy_cleanup_result=FAIL|error=${error instanceof Error ? error.message : 'unknown error'}`);
        process.exitCode = 1;
      });
    }
    if (verifierRoleCreated) {
      await adminPool.query(`DROP OWNED BY ${quoteIdentifier(verifierRole)}`).catch((error) => {
        console.error(`legacy_role_cleanup_result=FAIL|error=${error instanceof Error ? error.message : 'unknown error'}`);
        process.exitCode = 1;
      });
      await adminPool.query(`DROP ROLE ${quoteIdentifier(verifierRole)}`).catch((error) => {
        console.error(`legacy_role_cleanup_result=FAIL|error=${error instanceof Error ? error.message : 'unknown error'}`);
        process.exitCode = 1;
      });
    }
    await adminPool.end().catch(() => undefined);
  }
  if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
}
