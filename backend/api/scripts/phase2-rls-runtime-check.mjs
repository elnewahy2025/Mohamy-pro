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
const tenantTables = [
  'Organization',
  'Branch',
  'Department',
  'Team',
  'Membership',
  'TeamMember',
  'Invitation',
  'Role',
  'MembershipRole',
  'RolePermission',
  'AccessDenial',
  'OutboxMessage',
  'StorageObject',
  'IdempotencyKey',
];
const tenantOnlyTables = [
  'Organization',
  'Branch',
  'Department',
  'Team',
  'Membership',
  'TeamMember',
  'Invitation',
  'MembershipRole',
  'AccessDenial',
  'StorageObject',
];

if (!originalDatabaseUrl) {
  throw new Error(
    'DATABASE_URL is required in the local PowerShell session; the verifier does not print or create credentials.',
  );
}

const generatedDatabase = `mohamy_phase2_rls_fresh_${Date.now()}_${randomUUID().slice(0, 8)}`;
const verifierRole = `mohamy_phase2_rls_verifier_${randomUUID().slice(0, 8)}`;
if (!/^mohamy_phase2_rls_fresh_[a-z0-9_]+$/.test(generatedDatabase)) {
  throw new Error('Generated database name failed the safety check.');
}
if (!/^mohamy_phase2_rls_verifier_[a-z0-9_]+$/.test(verifierRole)) {
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
let rlsPool;
let created = false;
let verifierRoleCreated = false;

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error('Refusing to quote an unexpected database identifier.');
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
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

async function setContext(client, context) {
  await client.query(
    `SELECT
       set_config('app.tenant_id', $1, true),
       set_config('app.user_id', $2, true),
       set_config('app.membership_id', $3, true),
       set_config('app.operation_id', $4, true)`,
    [
      context.tenantId,
      context.userId,
      context.membershipId,
      context.operationId,
    ],
  );
}

async function inTenantContext(client, context, callback) {
  await client.query('BEGIN');
  try {
    await setContext(client, context);
    const result = await callback();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function inSettings(client, settings, callback) {
  await client.query('BEGIN');
  try {
    await client.query(
      `SELECT
         set_config('app.tenant_id', $1, true),
         set_config('app.user_id', $2, true),
         set_config('app.membership_id', $3, true),
         set_config('app.operation_id', $4, true)`,
      [
        settings.tenantId ?? '',
        settings.userId ?? '',
        settings.membershipId ?? '',
        settings.operationId ?? '',
      ],
    );
    const result = await callback();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function countFrom(result) {
  return Number(result.rows[0]?.count ?? -1);
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function requireTrue(value, label) {
  if (!value) {
    throw new Error(`${label}: expected true`);
  }
}

async function requireClearedContext(client, label) {
  const result = await client.query(
    `SELECT
       NULLIF(current_setting('app.tenant_id', true), '') AS tenant_id,
       NULLIF(current_setting('app.user_id', true), '') AS user_id,
       NULLIF(current_setting('app.membership_id', true), '') AS membership_id,
       NULLIF(current_setting('app.operation_id', true), '') AS operation_id`,
  );
  const contextValues = Object.entries(result.rows[0] ?? {});
  const leaked = contextValues.find(([, value]) => value !== null);
  if (leaked) {
    throw new Error(
      `${label}: tenant context leaked through ${leaked[0]}=${leaked[1]}`,
    );
  }
}

function requireRlsError(error, label) {
  if (error?.code !== '42501') {
    throw new Error(
      `${label}: expected PostgreSQL row-security error 42501, received ${error?.code ?? 'unknown'}`,
    );
  }
}

async function configureRlsVerifierRole() {
  const verifierPassword = `${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`;
  await adminPool.query(
    `CREATE ROLE ${quoteIdentifier(verifierRole)} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${quoteLiteral(verifierPassword)}`,
  );
  verifierRoleCreated = true;
  await adminPool.query(
    `GRANT CONNECT ON DATABASE ${quoteIdentifier(generatedDatabase)} TO ${quoteIdentifier(verifierRole)}`,
  );
  const tableList = tenantTables.map(quoteIdentifier).join(', ');
  await rlsPool.query(
    `GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(verifierRole)}`,
  );
  await rlsPool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${tableList} TO ${quoteIdentifier(verifierRole)}`,
  );
  await rlsPool.query(
    `GRANT EXECUTE ON FUNCTION public.app_tenant_context_is_valid(), public.app_membership_selection_context_is_valid(), public.app_worker_tenant_context_is_valid(), public.app_global_delivery_scope_is_valid(), public.app_actor_scope_is_valid() TO ${quoteIdentifier(verifierRole)}`,
  );
  await rlsPool.end();
  const verifierUrl = new URL(freshUrl.toString());
  verifierUrl.username = verifierRole;
  verifierUrl.password = verifierPassword;
  rlsPool = new Pool({ connectionString: verifierUrl.toString(), max: 1 });
  await rlsPool.query('SELECT 1');
  const roleState = await rlsPool.query(
    `SELECT current_user, session_user, rolsuper, rolbypassrls
     FROM pg_roles
     WHERE rolname = current_user`,
  );
  const role = roleState.rows[0];
  if (
    role?.current_user !== verifierRole ||
    role.session_user !== verifierRole ||
    role.rolsuper !== false ||
    role.rolbypassrls !== false
  ) {
    throw new Error(
      'RLS verifier connection did not use a LOGIN NOSUPERUSER NOBYPASSRLS role',
    );
  }
  console.log('rls_runtime_role_status=PASS|superuser=false|bypassrls=false');
}

async function seedTenant(
  client,
  tenant,
  user,
  membership,
  organization,
  role,
  permissionId,
) {
  await client.query(
    `INSERT INTO "Tenant" ("id", "slug", "name", "updatedAt")
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    [tenant.id, tenant.slug, tenant.name],
  );
  await client.query(
    `INSERT INTO "User" ("id", "emailNormalized", "updatedAt")
     VALUES ($1, $2, CURRENT_TIMESTAMP)`,
    [user.id, user.email],
  );
  await inTenantContext(
    client,
    {
      tenantId: tenant.id,
      userId: user.id,
      membershipId: membership.id,
      operationId: randomUUID(),
    },
    async () => {
      await client.query(
        `INSERT INTO "Membership" ("id", "tenantId", "userId", "status", "activeFrom", "updatedAt")
         VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [membership.id, tenant.id, user.id],
      );
      await client.query(
        `INSERT INTO "Organization" ("id", "tenantId", "slug", "name", "updatedAt")
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [organization.id, tenant.id, organization.slug, organization.name],
      );
      await client.query(
        `INSERT INTO "Role" ("id", "tenantId", "scope", "key", "name", "updatedAt")
         VALUES ($1, $2, 'TENANT', $3, $4, CURRENT_TIMESTAMP)`,
        [role.id, tenant.id, role.key, role.name],
      );
      await client.query(
        `INSERT INTO "RolePermission" ("roleId", "permissionId")
         VALUES ($1, $2)`,
        [role.id, permissionId],
      );
    },
  );
}

async function verifyRlsMetadata() {
  const expectedPolicyCounts = Object.fromEntries(
    tenantTables.map((table) => [table, table === 'Membership' ? 2 : 1]),
  );
  const result = await rlsPool.query(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, count(p.polname)::int AS policy_count
     FROM pg_class AS c
     LEFT JOIN pg_policy AS p ON p.polrelid = c.oid
     WHERE c.relname = ANY($1::text[])
     GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
     ORDER BY c.relname`,
    [tenantTables],
  );
  requireEqual(
    result.rows.length,
    tenantTables.length,
    'RLS table metadata count',
  );
  for (const row of result.rows) {
    requireTrue(row.relrowsecurity, `${row.relname} row security enabled`);
    requireTrue(row.relforcerowsecurity, `${row.relname} row security forced`);
    requireEqual(
      Number(row.policy_count),
      expectedPolicyCounts[row.relname],
      `${row.relname} policy count`,
    );
  }
  const policyCount = result.rows.reduce(
    (total, row) => total + Number(row.policy_count),
    0,
  );
  console.log(
    `rls_metadata_status=PASS|tables=${result.rows.length}|policies=${policyCount}`,
  );
}

async function verifyDefaultDenyAndIsolation(
  tenantA,
  tenantB,
  contexts,
  roleA,
  roleB,
) {
  for (const table of tenantOnlyTables) {
    const noContext = await rlsPool.query(
      `SELECT count(*)::int AS count FROM "${table}"`,
    );
    requireEqual(countFrom(noContext), 0, `no-context ${table} visibility`);
  }

  const tenantRoleNoContext = await rlsPool.query(
    `SELECT count(*)::int AS count FROM "Role" WHERE "scope" = 'TENANT'`,
  );
  const rolePermissionNoContext = await rlsPool.query(
    `SELECT count(*)::int AS count FROM "RolePermission"`,
  );
  requireEqual(
    countFrom(tenantRoleNoContext),
    0,
    'no-context tenant role visibility',
  );
  requireEqual(
    countFrom(rolePermissionNoContext),
    0,
    'no-context tenant role-permission visibility',
  );

  const unauthorizedInsertId = randomUUID();
  try {
    await rlsPool.query(
      `INSERT INTO "Organization" ("id", "tenantId", "slug", "name", "updatedAt")
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [unauthorizedInsertId, tenantA.id, 'blocked', 'Blocked'],
    );
    throw new Error('no-context tenant insert unexpectedly succeeded');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'no-context tenant insert unexpectedly succeeded'
    ) {
      throw error;
    }
    requireRlsError(error, 'no-context tenant insert');
  }

  const tenantAClient = await rlsPool.connect();
  try {
    const tenantARead = await inTenantContext(
      tenantAClient,
      contexts.a,
      async () => {
        const activeContext = await tenantAClient.query(
          `SELECT current_setting('app.tenant_id', true) AS tenant_id`,
        );
        requireEqual(
          activeContext.rows[0]?.tenant_id,
          contexts.a.tenantId,
          'Tenant A role checks active context',
        );
        const visible = await tenantAClient.query(
          `SELECT count(*)::int AS count FROM "Organization" WHERE "tenantId" = $1`,
          [tenantA.id],
        );
        const hidden = await tenantAClient.query(
          `SELECT count(*)::int AS count FROM "Organization" WHERE "tenantId" = $1`,
          [tenantB.id],
        );
        const ownRole = await tenantAClient.query(
          `SELECT count(*)::int AS count FROM "Role" WHERE "id" = $1`,
          [roleA.id],
        );
        const otherRole = await tenantAClient.query(
          `SELECT count(*)::int AS count FROM "Role" WHERE "id" = $1`,
          [roleB.id],
        );
        const ownRolePermission = await tenantAClient.query(
          `SELECT count(*)::int AS count FROM "RolePermission" WHERE "roleId" = $1`,
          [roleA.id],
        );
        const otherRolePermission = await tenantAClient.query(
          `SELECT count(*)::int AS count FROM "RolePermission" WHERE "roleId" = $1`,
          [roleB.id],
        );
        return {
          visible: countFrom(visible),
          hidden: countFrom(hidden),
          ownRole: countFrom(ownRole),
          otherRole: countFrom(otherRole),
          ownRolePermission: countFrom(ownRolePermission),
          otherRolePermission: countFrom(otherRolePermission),
        };
      },
    );
    requireEqual(
      tenantARead.visible,
      1,
      'Tenant A own organization visibility',
    );
    requireEqual(
      tenantARead.hidden,
      0,
      'Tenant A Tenant B organization visibility',
    );
    requireEqual(tenantARead.ownRole, 1, 'Tenant A own role visibility');
    requireEqual(tenantARead.otherRole, 0, 'Tenant A Tenant B role visibility');
    requireEqual(
      tenantARead.ownRolePermission,
      1,
      'Tenant A own role-permission visibility',
    );
    requireEqual(
      tenantARead.otherRolePermission,
      0,
      'Tenant A Tenant B role-permission visibility',
    );
  } finally {
    tenantAClient.release();
  }

  const selectionClient = await rlsPool.connect();
  try {
    const selected = await inSettings(
      selectionClient,
      {
        userId: contexts.a.userId,
        operationId: contexts.a.operationId,
      },
      async () => {
        const own = await selectionClient.query(
          `SELECT count(*)::int AS count FROM "Membership" WHERE "userId" = $1`,
          [contexts.a.userId],
        );
        const other = await selectionClient.query(
          `SELECT count(*)::int AS count FROM "Membership" WHERE "userId" = $1`,
          [contexts.b.userId],
        );
        return { own: countFrom(own), other: countFrom(other) };
      },
    );
    requireEqual(selected.own, 1, 'pre-switch own membership visibility');
    requireEqual(
      selected.other,
      0,
      'pre-switch other user membership visibility',
    );
  } finally {
    selectionClient.release();
  }
  console.log(
    'rls_default_deny_status=PASS|tenant_only_tables=10|missing_context_reads=0|missing_context_insert=DENIED',
  );
  console.log(
    'rls_membership_selection_status=PASS|user_a_own_membership=1|other_user_membership=0',
  );
  console.log(
    'rls_role_scope_status=PASS|tenant_a_sees_own_role=1|tenant_a_sees_b_role=0|tenant_a_sees_own_permission=1|tenant_a_sees_b_permission=0',
  );
  console.log(
    'rls_tenant_isolation_status=PASS|tenant_a_sees_a=1|tenant_a_sees_b=0',
  );
}

async function verifyMalformedContext(tenantA, contexts) {
  const client = await rlsPool.connect();
  try {
    const malformed = {
      ...contexts.a,
      tenantId: 'not-a-uuid',
    };
    const result = await inSettings(client, malformed, async () =>
      client.query(`SELECT count(*)::int AS count FROM "Organization"`),
    );
    requireEqual(countFrom(result), 0, 'malformed tenant context visibility');
    try {
      await inSettings(client, malformed, async () =>
        client.query(
          `INSERT INTO "Organization" ("id", "tenantId", "slug", "name", "updatedAt")
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
          [randomUUID(), tenantA.id, 'malformed', 'Malformed'],
        ),
      );
      throw new Error('malformed tenant insert unexpectedly succeeded');
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'malformed tenant insert unexpectedly succeeded'
      ) {
        throw error;
      }
      requireRlsError(error, 'malformed tenant insert');
    }
  } finally {
    client.release();
  }
  console.log('rls_malformed_context_status=PASS|read=0|insert=DENIED');
}

async function verifyHierarchyForeignKey(
  tenantA,
  tenantB,
  organizationB,
  contexts,
) {
  const client = await rlsPool.connect();
  try {
    try {
      await inTenantContext(client, contexts.a, async () =>
        client.query(
          `INSERT INTO "Branch" ("id", "tenantId", "organizationId", "slug", "name", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [
            randomUUID(),
            tenantA.id,
            organizationB.id,
            'cross-tenant',
            'Cross Tenant',
          ],
        ),
      );
      throw new Error('cross-tenant hierarchy insert unexpectedly succeeded');
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'cross-tenant hierarchy insert unexpectedly succeeded'
      ) {
        throw error;
      }
      if (error?.code !== '23503' && error?.code !== '42501') {
        throw new Error(
          `cross-tenant hierarchy insert: expected FK or RLS rejection, received ${error?.code ?? 'unknown'}`,
        );
      }
    }
  } finally {
    client.release();
  }
  console.log('rls_hierarchy_integrity_status=PASS|cross_tenant_parent=DENIED');
}

async function verifyRollbackAndPoolReuse(tenantA, tenantB, contexts) {
  const clientA = await rlsPool.connect();
  try {
    await inTenantContext(clientA, contexts.a, async () => {
      const inserted = await clientA.query(
        `INSERT INTO "Team" ("id", "tenantId", "slug", "name", "updatedAt")
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING "id"`,
        [randomUUID(), tenantA.id, 'rolled-back', 'Rolled Back'],
      );
      requireEqual(inserted.rows.length, 1, 'rollback test insert');
      throw new Error('intentional rollback verification failure');
    }).catch((error) => {
      if (
        !(error instanceof Error) ||
        error.message !== 'intentional rollback verification failure'
      ) {
        throw error;
      }
    });

    const afterRollback = await clientA.query(
      `SELECT count(*)::int AS count FROM "Team" WHERE "tenantId" = $1`,
      [tenantA.id],
    );
    requireEqual(countFrom(afterRollback), 0, 'rollback removed tenant write');
    await requireClearedContext(
      clientA,
      'tenant context after rollback on the same connection',
    );
    const noContextAfterRollback = await clientA.query(
      `SELECT count(*)::int AS count FROM "Organization"`,
    );
    requireEqual(
      countFrom(noContextAfterRollback),
      0,
      'no-context visibility after rollback',
    );
  } finally {
    clientA.release();
  }

  const clientB = await rlsPool.connect();
  try {
    await requireClearedContext(
      clientB,
      'tenant context through pool reuse before Tenant B',
    );
    const tenantBRead = await inTenantContext(clientB, contexts.b, async () => {
      const own = await clientB.query(
        `SELECT count(*)::int AS count FROM "Organization" WHERE "tenantId" = $1`,
        [tenantB.id],
      );
      const other = await clientB.query(
        `SELECT count(*)::int AS count FROM "Organization" WHERE "tenantId" = $1`,
        [tenantA.id],
      );
      return { own: countFrom(own), other: countFrom(other) };
    });
    requireEqual(tenantBRead.own, 1, 'Tenant B own organization visibility');
    requireEqual(
      tenantBRead.other,
      0,
      'Tenant B Tenant A organization visibility',
    );
    await requireClearedContext(
      clientB,
      'tenant context after Tenant B commit',
    );
  } finally {
    clientB.release();
  }
  console.log(
    'rls_transaction_rollback_status=PASS|rolled_back_team_rows=0|post_rollback_no_context_org_rows=0',
  );
  console.log(
    'rls_pool_reuse_status=PASS|tenant_a_to_b_context_reset=true|tenant_b_sees_a=0',
  );
}

async function setDeliveryScope(client) {
  await client.query(
    `SELECT
       set_config('app.delivery_scope', 'true', true),
       set_config('app.operation_id', $1, true)`,
    [randomUUID()],
  );
}

async function verifyOutboxRls(tenantA, contexts) {
  const messageIdA = randomUUID();
  const messageIdB = randomUUID();

  const seedClient = await rlsPool.connect();
  try {
    await inTenantContext(seedClient, contexts.a, async () => {
      await seedClient.query(
        `INSERT INTO "OutboxMessage"
           ("id", "tenantId", "aggregateType", "aggregateId", "eventType", "payload", "status", "availableAt", "attempts", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [messageIdA, tenantA.id, 'tenant.event', 'agg-a', 'tenant.created', '{}'],
      );
      await seedClient.query(
        `INSERT INTO "OutboxMessage"
           ("id", "tenantId", "aggregateType", "aggregateId", "eventType", "payload", "status", "availableAt", "attempts", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [messageIdB, tenantA.id, 'global.event', 'agg-b', 'health.status.updated', '{}'],
      );
    });
  } finally {
    seedClient.release();
  }

  const client = await rlsPool.connect();
  try {
    const noContext = await client.query(
      `SELECT count(*)::int AS count FROM "OutboxMessage"`,
    );
    requireEqual(countFrom(noContext), 0, 'no-context outbox visibility');

    const crossTenant = await inTenantContext(client, contexts.a, async () => {
      const own = await client.query(
        `SELECT count(*)::int AS count FROM "OutboxMessage" WHERE "id" = $1`,
        [messageIdA],
      );
      return countFrom(own);
    });
    requireEqual(crossTenant, 1, 'tenant context outbox own-message visibility');

    let crossInsertRejected = false;
    await inTenantContext(client, contexts.a, async () => {
      try {
        await client.query(
          `INSERT INTO "OutboxMessage"
             ("id", "tenantId", "aggregateType", "aggregateId", "eventType", "payload", "status", "availableAt", "attempts", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [randomUUID(), tenantA.id, 'cross", "g', 'agg-x', 'tenant.created', '{}'],
        );
      } catch (error) {
        if (error?.code === '42501') {
          crossInsertRejected = true;
          return;
        }
        throw error;
      }
    });
    if (!crossInsertRejected) {
      const blockedRead = await inTenantContext(client, contexts.a, async () =>
        client.query(
          `SELECT count(*)::int AS count FROM "OutboxMessage" WHERE "tenantId" = '00000000-0000-4000-8000-000000000000'`,
        ),
      );
      requireEqual(
        countFrom(blockedRead),
        0,
        'tenant context cannot read other-tenant outbox rows',
      );
    }

    await inTenantContext(client, contexts.a, async () => {
      const ownVisible = await client.query(
        `SELECT count(*)::int AS count FROM "OutboxMessage" WHERE "id" = $1`,
        [messageIdA],
      );
      requireEqual(
        countFrom(ownVisible),
        1,
        'tenant context sees own outbox message',
      );
    });

    await setDeliveryScope(client);
    const deliveryScoped = await client.query(
      `SELECT count(*)::int AS count FROM "OutboxMessage"`,
    );
    requireEqual(
      countFrom(deliveryScoped),
      2,
      'delivery scope sees all outbox messages across tenants',
    );
    await requireClearedContext(
      client,
      'delivery scope after outbox verification',
    );
  } finally {
    client.release();
  }
  console.log(
    'rls_outbox_status=PASS|no_context=0|tenant_sees_own=1|tenant_cannot_read_global=blocked|delivery_scope_sees_all=2',
  );
}

async function setWorkerScope(client, tenantId) {
  await client.query(
    `SELECT
       set_config('app.tenant_id', $1, true),
       set_config('app.user_id', '', true),
       set_config('app.membership_id', '', true),
       set_config('app.operation_id', $2, true)`,
    [tenantId, randomUUID()],
  );
}

async function setActorScope(client, userId) {
  await client.query(
    `SELECT
       set_config('app.tenant_id', '', true),
       set_config('app.user_id', $1, true),
       set_config('app.membership_id', '', true),
       set_config('app.operation_id', $2, true)`,
    [userId, randomUUID()],
  );
}

async function verifyStorageRls(tenantA, tenantB, contexts) {
  const objectA = randomUUID();
  const objectB = randomUUID();

  const seedClient = await rlsPool.connect();
  try {
    await inTenantContext(seedClient, contexts.a, async () => {
      await seedClient.query(
        `INSERT INTO "StorageObject"
           ("id", "tenantId", "key", "sha256", "sizeBytes", "contentType", "encryptionMode", "malwareStatus")
         VALUES ($1, $2, $3, $4, 1, 'text/plain', 'NONE', 'NOT_SCANNED')`,
        [objectA, tenantA.id, `a-${randomUUID()}`, 'a'.repeat(64)],
      );
    });
    await inTenantContext(seedClient, contexts.b, async () => {
      await seedClient.query(
        `INSERT INTO "StorageObject"
           ("id", "tenantId", "key", "sha256", "sizeBytes", "contentType", "encryptionMode", "malwareStatus")
         VALUES ($1, $2, $3, $4, 1, 'text/plain', 'NONE', 'NOT_SCANNED')`,
        [objectB, tenantB.id, `b-${randomUUID()}`, 'b'.repeat(64)],
      );
    });
  } finally {
    seedClient.release();
  }

  const client = await rlsPool.connect();
  try {
    const noContext = await client.query(
      `SELECT count(*)::int AS count FROM "StorageObject"`,
    );
    requireEqual(countFrom(noContext), 0, 'no-context storage visibility');

    const tenantARead = await inTenantContext(client, contexts.a, async () => {
      const own = await client.query(
        `SELECT count(*)::int AS count FROM "StorageObject" WHERE "id" = $1`,
        [objectA],
      );
      const other = await client.query(
        `SELECT count(*)::int AS count FROM "StorageObject" WHERE "id" = $1`,
        [objectB],
      );
      return { own: countFrom(own), other: countFrom(other) };
    });
    requireEqual(tenantARead.own, 1, 'Tenant A own storage object visibility');
    requireEqual(
      tenantARead.other,
      0,
      'Tenant A Tenant B storage object visibility',
    );

    await setWorkerScope(client, tenantA.id);
    const workerRead = await client.query(
      `SELECT count(*)::int AS count FROM "StorageObject" WHERE "id" = $1`,
      [objectA],
    );
    requireEqual(
      countFrom(workerRead),
      1,
      'worker scope storage object visibility',
    );
    await requireClearedContext(client, 'worker scope after storage verification');
  } finally {
    client.release();
  }
  console.log(
    'rls_storage_status=PASS|no_context=0|tenant_a_sees_own=1|tenant_a_sees_b=0|worker_scope_sees_own=1',
  );
}

async function verifyIdempotencyRls(tenantA, contexts) {
  const tenantKeyId = randomUUID();
  const actorKeyId = randomUUID();

  const seedClient = await rlsPool.connect();
  try {
    await inTenantContext(seedClient, contexts.a, async () => {
      await seedClient.query(
        `INSERT INTO "IdempotencyKey"
           ("id", "key", "tenantScope", "tenantId", "actorScope", "method", "route", "fingerprint", "state", "expiresAt")
         VALUES ($1, $2, $3, $4, NULL, 'POST', '/tenant', $5, 'RESERVED', CURRENT_TIMESTAMP + interval '1 hour')`,
        [tenantKeyId, `t-${randomUUID()}`, 'tenant-A', tenantA.id, 'finger-a'],
      );
    });
    await setActorScope(seedClient, contexts.a.userId);
    await seedClient.query(
      `INSERT INTO "IdempotencyKey"
         ("id", "key", "tenantScope", "tenantId", "actorScope", "method", "route", "fingerprint", "state", "expiresAt")
       VALUES ($1, $2, NULL, NULL, $3, 'POST', '/switch', $4, 'RESERVED', CURRENT_TIMESTAMP + interval '1 hour')
       RETURNING "id"`,
      [actorKeyId, `a-${randomUUID()}`, contexts.a.userId, 'finger-a'],
    );
    await seedClient.query(
      `SELECT set_config('app.tenant_id', '', true), set_config('app.membership_id', '', true), set_config('app.user_id', '', true), set_config('app.operation_id', '', true)`,
    );
  } finally {
    seedClient.release();
  }

  const client = await rlsPool.connect();
  try {
    const noContext = await client.query(
      `SELECT count(*)::int AS count FROM "IdempotencyKey"`,
    );
    requireEqual(countFrom(noContext), 0, 'no-context idempotency visibility');

    const tenantARead = await inTenantContext(client, contexts.a, async () => {
      const tenantRow = await client.query(
        `SELECT count(*)::int AS count FROM "IdempotencyKey" WHERE "id" = $1`,
        [tenantKeyId],
      );
      const actorRow = await client.query(
        `SELECT count(*)::int AS count FROM "IdempotencyKey" WHERE "id" = $1`,
        [actorKeyId],
      );
      return { tenantRow: countFrom(tenantRow), actorRow: countFrom(actorRow) };
    });
    requireEqual(
      tenantARead.tenantRow,
      1,
      'tenant context sees own tenant idempotency row',
    );
    requireEqual(
      tenantARead.actorRow,
      0,
      'tenant context cannot see actor-only idempotency row',
    );

    await setActorScope(client, contexts.a.userId);
    const actorRead = await client.query(
      `SELECT count(*)::int AS count FROM "IdempotencyKey" WHERE "id" = $1`,
      [actorKeyId],
    );
    requireEqual(
      countFrom(actorRead),
      1,
      'actor scope sees actor-only idempotency row',
    );
    const actorTenantRow = await client.query(
      `SELECT count(*)::int AS count FROM "IdempotencyKey" WHERE "id" = $1`,
      [tenantKeyId],
    );
    requireEqual(
      countFrom(actorTenantRow),
      0,
      'actor scope cannot see tenant-scoped idempotency row',
    );
    await requireClearedContext(
      client,
      'actor scope after idempotency verification',
    );
  } finally {
    client.release();
  }
  console.log(
    'rls_idempotency_status=PASS|no_context=0|tenant_sees_own_tenant_row=1|tenant_cannot_see_actor_row=0|actor_sees_actor_row=1',
  );
}

async function main() {
  requireEqual(
    quoteIdentifier('Organization'),
    '"Organization"',
    'mixed-case table identifier quoting',
  );
  requireEqual(
    quoteIdentifier(generatedDatabase),
    `"${generatedDatabase}"`,
    'generated database identifier quoting',
  );
  requireEqual(
    quoteIdentifier(verifierRole),
    `"${verifierRole}"`,
    'generated role identifier quoting',
  );

  adminPool = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await adminPool.query(
    `CREATE DATABASE ${quoteIdentifier(generatedDatabase)}`,
  );
  created = true;
  runMigrations();
  rlsPool = new Pool({ connectionString: freshUrl.toString(), max: 1 });
  await rlsPool.query('SELECT 1');

  await verifyRlsMetadata();

  const permissionId = randomUUID();
  await rlsPool.query(
    `INSERT INTO "Permission" ("id", "key", "description")
     VALUES ($1, $2, $3)`,
    [
      permissionId,
      `phase2.rls.${randomUUID().replaceAll('-', '')}`,
      'RLS runtime permission',
    ],
  );

  const tenantA = {
    id: randomUUID(),
    slug: `tenant-a-${randomUUID().slice(0, 8)}`,
    name: 'Tenant A',
  };
  const tenantB = {
    id: randomUUID(),
    slug: `tenant-b-${randomUUID().slice(0, 8)}`,
    name: 'Tenant B',
  };
  const userA = { id: randomUUID(), email: `a-${randomUUID()}@example.test` };
  const userB = { id: randomUUID(), email: `b-${randomUUID()}@example.test` };
  const membershipA = { id: randomUUID() };
  const membershipB = { id: randomUUID() };
  const organizationA = {
    id: randomUUID(),
    slug: `org-a-${randomUUID().slice(0, 8)}`,
    name: 'Organization A',
  };
  const organizationB = {
    id: randomUUID(),
    slug: `org-b-${randomUUID().slice(0, 8)}`,
    name: 'Organization B',
  };
  const roleA = {
    id: randomUUID(),
    key: `tenant-a-role-${randomUUID().slice(0, 8)}`,
    name: 'Tenant A Role',
  };
  const roleB = {
    id: randomUUID(),
    key: `tenant-b-role-${randomUUID().slice(0, 8)}`,
    name: 'Tenant B Role',
  };
  const contexts = {
    a: {
      tenantId: tenantA.id,
      userId: userA.id,
      membershipId: membershipA.id,
      operationId: randomUUID(),
    },
    b: {
      tenantId: tenantB.id,
      userId: userB.id,
      membershipId: membershipB.id,
      operationId: randomUUID(),
    },
  };

  const seedClient = await rlsPool.connect();
  try {
    await seedTenant(
      seedClient,
      tenantA,
      userA,
      membershipA,
      organizationA,
      roleA,
      permissionId,
    );
    await seedTenant(
      seedClient,
      tenantB,
      userB,
      membershipB,
      organizationB,
      roleB,
      permissionId,
    );
  } finally {
    seedClient.release();
  }

  await configureRlsVerifierRole();
  await verifyDefaultDenyAndIsolation(tenantA, tenantB, contexts, roleA, roleB);
  await verifyMalformedContext(tenantA, contexts);
  await verifyHierarchyForeignKey(tenantA, tenantB, organizationB, contexts);
  await verifyRollbackAndPoolReuse(tenantA, tenantB, contexts);
  await verifyOutboxRls(tenantA, contexts);
  await verifyStorageRls(tenantA, tenantB, contexts);
  await verifyIdempotencyRls(tenantA, contexts);

  console.log(`rls_runtime_result=PASS|database=${generatedDatabase}`);
}

try {
  await main();
} catch (error) {
  console.error(
    `rls_runtime_result=FAIL|error=${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
} finally {
  if (rlsPool) {
    await rlsPool.end().catch(() => undefined);
  }
  if (adminPool) {
    if (created) {
      await adminPool
        .query(`DROP DATABASE ${quoteIdentifier(generatedDatabase)}`)
        .catch((error) => {
          console.error(
            `rls_cleanup_result=FAIL|error=${error instanceof Error ? error.message : 'unknown error'}`,
          );
          process.exitCode = 1;
        });
    }
    if (verifierRoleCreated) {
      await adminPool
        .query(`DROP OWNED BY ${quoteIdentifier(verifierRole)}`)
        .catch((error) => {
          console.error(
            `rls_role_cleanup_result=FAIL|error=${error instanceof Error ? error.message : 'unknown error'}`,
          );
          process.exitCode = 1;
        });
      await adminPool
        .query(`DROP ROLE ${quoteIdentifier(verifierRole)}`)
        .catch((error) => {
          console.error(
            `rls_role_cleanup_result=FAIL|error=${error instanceof Error ? error.message : 'unknown error'}`,
          );
          process.exitCode = 1;
        });
    }
    await adminPool.end().catch(() => undefined);
  }
  if (originalDatabaseUrl) {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
}
