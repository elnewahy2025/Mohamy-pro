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
];

if (!originalDatabaseUrl) {
  throw new Error(
    'DATABASE_URL is required in the local PowerShell session; the verifier does not print or create credentials.',
  );
}

const generatedDatabase = `mohamy_phase2_rls_fresh_${Date.now()}_${randomUUID().slice(0, 8)}`;
if (!/^mohamy_phase2_rls_fresh_[a-z0-9_]+$/.test(generatedDatabase)) {
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
let freshPool;
let created = false;

function quoteIdentifier(identifier) {
  if (!/^[a-z0-9_]+$/.test(identifier)) {
    throw new Error('Refusing to quote an unexpected database identifier.');
  }
  return `"${identifier}"`;
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

function requireRlsError(error, label) {
  if (error?.code !== '42501') {
    throw new Error(
      `${label}: expected PostgreSQL row-security error 42501, received ${error?.code ?? 'unknown'}`,
    );
  }
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
        `INSERT INTO "Membership" ("id", "tenantId", "userId", "status", "activeFrom")
         VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP)`,
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
  const result = await freshPool.query(
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
    const noContext = await freshPool.query(
      `SELECT count(*)::int AS count FROM "${table}"`,
    );
    requireEqual(countFrom(noContext), 0, `no-context ${table} visibility`);
  }

  const tenantRoleNoContext = await freshPool.query(
    `SELECT count(*)::int AS count FROM "Role" WHERE "scope" = 'TENANT'`,
  );
  const rolePermissionNoContext = await freshPool.query(
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
    await freshPool.query(
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

  const tenantAClient = await freshPool.connect();
  try {
    const tenantARead = await inTenantContext(
      tenantAClient,
      contexts.a,
      async () => {
        const visible = await tenantAClient.query(
          `SELECT count(*)::int AS count FROM "Organization" WHERE "tenantId" = $1`,
          [tenantA.id],
        );
        const hidden = await tenantAClient.query(
          `SELECT count(*)::int AS count FROM "Organization" WHERE "tenantId" = $1`,
          [tenantB.id],
        );
        return { visible: countFrom(visible), hidden: countFrom(hidden) };
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
    requireEqual(countFrom(ownRole), 1, 'Tenant A own role visibility');
    requireEqual(countFrom(otherRole), 0, 'Tenant A Tenant B role visibility');
    requireEqual(
      countFrom(ownRolePermission),
      1,
      'Tenant A own role-permission visibility',
    );
    requireEqual(
      countFrom(otherRolePermission),
      0,
      'Tenant A Tenant B role-permission visibility',
    );
  } finally {
    tenantAClient.release();
  }

  const selectionClient = await freshPool.connect();
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
    'rls_default_deny_status=PASS|tenant_only_tables=9|missing_context_reads=0|missing_context_insert=DENIED',
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
  const client = await freshPool.connect();
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
  const client = await freshPool.connect();
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
  const clientA = await freshPool.connect();
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
    const reset = await clientA.query(
      `SELECT current_setting('app.tenant_id', true) AS tenant_id`,
    );
    if (reset.rows[0]?.tenant_id !== null) {
      throw new Error(
        'tenant context leaked after rollback on the same connection',
      );
    }
  } finally {
    clientA.release();
  }

  const clientB = await freshPool.connect();
  try {
    const resetBeforeB = await clientB.query(
      `SELECT current_setting('app.tenant_id', true) AS tenant_id`,
    );
    if (resetBeforeB.rows[0]?.tenant_id !== null) {
      throw new Error(
        'tenant context leaked through pool reuse before Tenant B',
      );
    }
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
    const resetAfterB = await clientB.query(
      `SELECT current_setting('app.tenant_id', true) AS tenant_id`,
    );
    if (resetAfterB.rows[0]?.tenant_id !== null) {
      throw new Error('tenant context leaked after Tenant B commit');
    }
  } finally {
    clientB.release();
  }
  console.log('rls_transaction_rollback_status=PASS|rolled_back_team_rows=0');
  console.log(
    'rls_pool_reuse_status=PASS|tenant_a_to_b_context_reset=true|tenant_b_sees_a=0',
  );
}

async function main() {
  adminPool = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await adminPool.query(
    `CREATE DATABASE ${quoteIdentifier(generatedDatabase)}`,
  );
  created = true;
  runMigrations();
  freshPool = new Pool({ connectionString: freshUrl.toString(), max: 1 });
  await freshPool.query('SELECT 1');

  await verifyRlsMetadata();

  const permissionId = randomUUID();
  await freshPool.query(
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

  const seedClient = await freshPool.connect();
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

  await verifyDefaultDenyAndIsolation(tenantA, tenantB, contexts, roleA, roleB);
  await verifyMalformedContext(tenantA, contexts);
  await verifyHierarchyForeignKey(tenantA, tenantB, organizationB, contexts);
  await verifyRollbackAndPoolReuse(tenantA, tenantB, contexts);

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
  if (freshPool) {
    await freshPool.end().catch(() => undefined);
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
    await adminPool.end().catch(() => undefined);
  }
  if (originalDatabaseUrl) {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
}
