import pg from 'pg';
import { loadApiLocalEnv } from './load-api-local-env.mjs';

loadApiLocalEnv(import.meta.url);

const { Client } = pg;
const targetRoleName = 'mohamy_app';
const connectionSource = process.env.MIGRATION_DATABASE_URL
  ? 'migration_url'
  : 'runtime_fallback';
const databaseUrl =
  process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

function required(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function bool(value) {
  return value === true;
}

function count(value) {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('bounded count was invalid');
  }
  return parsed;
}

function marker(value) {
  return value ? 'true' : 'false';
}

async function readInventory(client) {
  await client.query(
    'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY',
  );
  try {
    const currentRole = await client.query(`
      SELECT
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls,
        r.rolcreatedb AS can_create_database,
        r.rolcreaterole AS can_create_role,
        r.rolcanlogin AS can_login,
        (
          SELECT count(*)
          FROM pg_class AS c
          WHERE c.relnamespace = 'public'::regnamespace
            AND c.relowner = r.oid
        )::int AS owned_public_relations,
        (
          SELECT count(*)
          FROM pg_proc AS p
          WHERE p.pronamespace = 'public'::regnamespace
            AND p.proowner = r.oid
        )::int AS owned_public_functions,
        EXISTS (
          SELECT 1
          FROM pg_namespace AS n
          WHERE n.nspname = 'public'
            AND n.nspowner = r.oid
        ) AS owns_public_schema
      FROM pg_roles AS r
      WHERE r.rolname = current_user
    `);

    const targetRole = await client.query(
      `
        SELECT
          r.rolcanlogin AS can_login,
          r.rolsuper AS is_superuser,
          r.rolbypassrls AS bypasses_rls,
          r.rolcreatedb AS can_create_database,
          r.rolcreaterole AS can_create_role,
          has_schema_privilege(r.rolname, 'public', 'USAGE') AS has_public_schema_usage,
          has_schema_privilege(r.rolname, 'public', 'CREATE') AS has_public_schema_create,
          (
            SELECT count(*)
            FROM pg_auth_members AS m
            WHERE m.member = r.oid
          )::int AS membership_count,
          (
            SELECT count(*)
            FROM pg_class AS c
            WHERE c.relowner = r.oid
          )::int AS owned_relation_count,
          (
            SELECT count(*)
            FROM pg_proc AS p
            WHERE p.proowner = r.oid
          )::int AS owned_function_count
        FROM pg_roles AS r
        WHERE r.rolname = $1
      `,
      [targetRoleName],
    );

    const rlsState = await client.query(`
      SELECT
        c.relrowsecurity AS row_security_enabled,
        c.relforcerowsecurity AS row_security_forced
      FROM pg_class AS c
      WHERE c.oid = 'public."AuditEvent"'::regclass
    `);

    const current = currentRole.rows[0];
    const target = targetRole.rows[0] ?? null;
    const rls = rlsState.rows[0];
    if (!current || !rls)
      throw new Error('required inventory state was unavailable');

    const result = {
      currentSuperuser: bool(current.is_superuser),
      currentBypassesRls: bool(current.bypasses_rls),
      currentCanCreateDatabase: bool(current.can_create_database),
      currentCanCreateRole: bool(current.can_create_role),
      currentCanLogin: bool(current.can_login),
      currentOwnedPublicRelations: count(current.owned_public_relations),
      currentOwnedPublicFunctions: count(current.owned_public_functions),
      currentOwnsPublicSchema: bool(current.owns_public_schema),
      targetExists: target !== null,
      targetCanLogin: target ? bool(target.can_login) : false,
      targetSuperuser: target ? bool(target.is_superuser) : false,
      targetBypassesRls: target ? bool(target.bypasses_rls) : false,
      targetCanCreateDatabase: target
        ? bool(target.can_create_database)
        : false,
      targetCanCreateRole: target ? bool(target.can_create_role) : false,
      targetHasPublicSchemaUsage: target
        ? bool(target.has_public_schema_usage)
        : false,
      targetHasPublicSchemaCreate: target
        ? bool(target.has_public_schema_create)
        : false,
      targetMemberships: target ? count(target.membership_count) : 0,
      targetOwnedRelations: target ? count(target.owned_relation_count) : 0,
      targetOwnedFunctions: target ? count(target.owned_function_count) : 0,
      auditRlsEnabled: bool(rls.row_security_enabled),
      auditRlsForced: bool(rls.row_security_forced),
    };

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function run() {
  const client = new Client({
    connectionString: required(
      'MIGRATION_DATABASE_URL or DATABASE_URL',
      databaseUrl,
    ),
  });
  try {
    await client.connect();
    const inventory = await readInventory(client);
    console.log(`admin_inventory_source=${connectionSource}`);
    console.log(
      `admin_inventory_current=superuser=${marker(inventory.currentSuperuser)}|bypassrls=${marker(inventory.currentBypassesRls)}|createdb=${marker(inventory.currentCanCreateDatabase)}|createrole=${marker(inventory.currentCanCreateRole)}|canlogin=${marker(inventory.currentCanLogin)}|owned_relations=${inventory.currentOwnedPublicRelations}|owned_functions=${inventory.currentOwnedPublicFunctions}|owns_public_schema=${marker(inventory.currentOwnsPublicSchema)}`,
    );
    console.log(
      `admin_inventory_target=exists=${marker(inventory.targetExists)}|canlogin=${marker(inventory.targetCanLogin)}|superuser=${marker(inventory.targetSuperuser)}|bypassrls=${marker(inventory.targetBypassesRls)}|createdb=${marker(inventory.targetCanCreateDatabase)}|createrole=${marker(inventory.targetCanCreateRole)}|schema_usage=${marker(inventory.targetHasPublicSchemaUsage)}|schema_create=${marker(inventory.targetHasPublicSchemaCreate)}|memberships=${inventory.targetMemberships}|owned_relations=${inventory.targetOwnedRelations}|owned_functions=${inventory.targetOwnedFunctions}`,
    );
    console.log(
      `admin_inventory_audit_rls=enabled=${marker(inventory.auditRlsEnabled)}|forced=${marker(inventory.auditRlsForced)}`,
    );
  } catch (error) {
    console.error(
      `admin_inventory_result=FAIL|error_class=${error instanceof Error ? error.name : 'UnknownError'}`,
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

await run();
