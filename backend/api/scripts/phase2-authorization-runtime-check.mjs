import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const apiBaseUrl =
  process.env.AUTH_RUNTIME_API_BASE_URL ?? 'http://127.0.0.1:3000';
const origin = process.env.AUTH_RUNTIME_ORIGIN ?? 'http://localhost:5173';
const username = process.env.AUTH_RUNTIME_USERNAME ?? 'phase2-runtime-user';
const password = process.env.AUTH_RUNTIME_PASSWORD ?? 'phase2-runtime-password';
const cookieName = process.env.SESSION_COOKIE_NAME ?? 'mohamy_session';
const databaseUrl = process.env.DATABASE_URL;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const timeoutMs = 30_000;

class CookieJar {
  #cookies = new Map();

  apply(response) {
    const setCookies =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : splitSetCookie(response.headers.get('set-cookie'));
    for (const value of setCookies) {
      const pair = value.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      if (cookieValue.length === 0 || /max-age=0/i.test(value)) {
        this.#cookies.delete(name);
      } else {
        this.#cookies.set(name, cookieValue);
      }
    }
  }

  header() {
    return [...this.#cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  has(name) {
    return this.#cookies.has(name);
  }
}

function splitSetCookie(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=]+=[^;,]+)/);
}

function required(name, value) {
  if (!value) throw new Error(`${name}_MISSING`);
}

function requireStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(`${label}_HTTP_${response.status}`);
  }
}

function databaseErrorCode(error) {
  return error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : 'none';
}

function verifierFailure(code) {
  const error = new Error(code);
  error.verifierCode = code;
  return error;
}

async function request(url, options = {}, jar) {
  const headers = new Headers(options.headers ?? {});
  const cookie = jar?.header();
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(url, {
    ...options,
    headers,
    redirect: 'manual',
  });
  jar?.apply(response);
  return response;
}

function absoluteLocation(base, response, label) {
  const location = response.headers.get('location');
  if (!location) throw new Error(`${label}_LOCATION_MISSING`);
  return new URL(location, base).toString();
}

function htmlAttribute(tag, name) {
  const match = tag.match(new RegExp(`${name}=["']([^"']*)`, 'i'));
  return match?.[1]?.replaceAll('&amp;', '&') ?? '';
}

function loginForm(html, baseUrl) {
  const formTag = html.match(
    /<form\b[^>]*id=["']kc-form-login["'][^>]*>/i,
  )?.[0];
  if (!formTag) throw new Error('KEYCLOAK_LOGIN_FORM_MISSING');
  const action = htmlAttribute(formTag, 'action');
  if (!action) throw new Error('KEYCLOAK_LOGIN_ACTION_MISSING');
  const fields = new URLSearchParams();
  for (const input of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = input[0];
    if (htmlAttribute(tag, 'type').toLowerCase() !== 'hidden') continue;
    const name = htmlAttribute(tag, 'name');
    if (name) fields.set(name, htmlAttribute(tag, 'value'));
  }
  fields.set('username', username);
  fields.set('password', password);
  return { action: new URL(action, baseUrl).toString(), fields };
}

async function readJson(response, label) {
  const text = await response.text();
  if (!text) throw new Error(`${label}_BODY_EMPTY`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}_JSON_INVALID`);
  }
}

function unwrap(value) {
  return value && value.success === true && value.data ? value.data : value;
}

async function login() {
  const jar = new CookieJar();
  const loginResponse = await request(
    `${apiBaseUrl}/api/v1/auth/login?returnTo=%2Fen`,
    {},
    jar,
  );
  requireStatus(loginResponse, 302, 'LOGIN_START');
  const authorizationUrl = absoluteLocation(
    apiBaseUrl,
    loginResponse,
    'LOGIN_START',
  );
  const authorization = new URL(authorizationUrl);
  if (!authorization.searchParams.get('state'))
    throw new Error('OIDC_STATE_MISSING');
  if (!authorization.searchParams.get('nonce'))
    throw new Error('OIDC_NONCE_MISSING');
  if (authorization.searchParams.get('code_challenge_method') !== 'S256') {
    throw new Error('OIDC_PKCE_METHOD_INVALID');
  }
  if (!authorization.searchParams.get('code_challenge')) {
    throw new Error('OIDC_PKCE_CHALLENGE_MISSING');
  }
  console.log(
    'authorization_oidc_status=PASS|pkce_s256=true|state_nonce_present=true',
  );

  const keycloakLogin = await request(authorizationUrl, {}, jar);
  requireStatus(keycloakLogin, 200, 'KEYCLOAK_LOGIN_PAGE');
  const html = await keycloakLogin.text();
  const form = loginForm(html, authorizationUrl);
  const credentialResponse = await request(
    form.action,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.fields,
    },
    jar,
  );
  requireStatus(credentialResponse, 302, 'KEYCLOAK_CREDENTIALS');
  const callbackUrl = absoluteLocation(
    authorizationUrl,
    credentialResponse,
    'KEYCLOAK_CREDENTIALS',
  );
  const callback = await request(callbackUrl, { headers: { origin } }, jar);
  requireStatus(callback, 302, 'OIDC_CALLBACK');
  const returnLocation = absoluteLocation(
    apiBaseUrl,
    callback,
    'OIDC_CALLBACK',
  );
  if (!returnLocation.startsWith(`${origin}/en`)) {
    throw new Error('OIDC_RETURN_LOCATION_INVALID');
  }
  if (!jar.has(cookieName)) throw new Error('SESSION_COOKIE_MISSING');
  const sessionResponse = await request(
    `${apiBaseUrl}/api/v1/auth/session`,
    {},
    jar,
  );
  requireStatus(sessionResponse, 200, 'AUTH_SESSION');
  const session = unwrap(await readJson(sessionResponse, 'AUTH_SESSION'));
  if (session.authenticated !== true || typeof session.user?.id !== 'string') {
    throw new Error('AUTH_SESSION_INCOMPLETE');
  }
  const csrfResponse = await request(`${apiBaseUrl}/api/v1/auth/csrf`, {}, jar);
  requireStatus(csrfResponse, 200, 'CSRF');
  const csrf = unwrap(await readJson(csrfResponse, 'CSRF'));
  if (!/^[A-Za-z0-9_-]{43}$/.test(csrf.csrfToken ?? '')) {
    throw new Error('CSRF_INVALID');
  }
  return { jar, session, csrfToken: csrf.csrfToken };
}

async function provisionFixtures(admin, userId) {
  const fixture = {
    tenantId: randomUUID(),
    membershipId: randomUUID(),
    tenantRoleId: randomUUID(),
    globalRoleId: randomUUID(),
    globalAssignmentId: randomUUID(),
    platformAssignmentId: randomUUID(),
    otherUserId: randomUUID(),
    otherAssignmentId: randomUUID(),
    tenantPermissionId: randomUUID(),
    globalPermissionId: randomUUID(),
    platformRoleId: randomUUID(),
    platformPermissionId: randomUUID(),
    tenantSlug: `phase2-authz-${randomUUID().slice(0, 8)}`,
    globalRoleKey: `phase2_runtime_global_${randomUUID().slice(0, 8)}`,
    tenantRoleKey: `tenant_admin`,
    platformRoleKey: 'platform_admin',
    permissionKey: `tenant.read`,
    platformPermissionKey: 'tenant.platform_manage',
    mfaIdempotencyKey: randomUUID(),
  };
  const original = await admin.query(
    'SELECT "status"::text AS status FROM "User" WHERE "id" = $1',
    [userId],
  );
  if (original.rowCount !== 1) throw new Error('AUTH_USER_NOT_FOUND');
  fixture.originalUserStatus = original.rows[0].status;

  await admin.query('BEGIN');
  try {
    await admin.query(
      'UPDATE "User" SET "status" = \'ACTIVE\', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1',
      [userId],
    );
    await admin.query(
      'INSERT INTO "User" ("id", "status", "locale", "createdAt", "updatedAt") VALUES ($1, \'PENDING\', \'en\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [fixture.otherUserId],
    );
    await admin.query(
      'INSERT INTO "Tenant" ("id", "slug", "name", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, \'ACTIVE\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [
        fixture.tenantId,
        fixture.tenantSlug,
        'Phase 2 authorization runtime fixture',
      ],
    );
    await admin.query(
      'INSERT INTO "Membership" ("id", "tenantId", "userId", "status", "activeFrom", "createdAt", "updatedAt", "activatedAt") VALUES ($1, $2, $3, \'ACTIVE\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [fixture.membershipId, fixture.tenantId, userId],
    );
    await admin.query(
      'INSERT INTO "Permission" ("id", "key", "description", "createdAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING',
      [
        fixture.tenantPermissionId,
        fixture.permissionKey,
        'Tenant read permission',
      ],
    );
    const permission = await admin.query(
      'SELECT "id" FROM "Permission" WHERE "key" = $1',
      [fixture.permissionKey],
    );
    if (permission.rowCount !== 1) throw new Error('TENANT_PERMISSION_MISSING');
    fixture.tenantPermissionId = permission.rows[0].id;
    await admin.query(
      'INSERT INTO "Permission" ("id", "key", "description", "createdAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING',
      [
        fixture.platformPermissionId,
        fixture.platformPermissionKey,
        'Platform tenant administration permission',
      ],
    );
    const platformPermission = await admin.query(
      'SELECT "id" FROM "Permission" WHERE "key" = $1',
      [fixture.platformPermissionKey],
    );
    if (platformPermission.rowCount !== 1)
      throw new Error('PLATFORM_PERMISSION_MISSING');
    fixture.platformPermissionId = platformPermission.rows[0].id;
    await admin.query(
      'INSERT INTO "Role" ("id", "tenantId", "scope", "key", "name", "createdAt", "updatedAt") VALUES ($1, $2, \'TENANT\', $3, \'Tenant Admin\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [fixture.tenantRoleId, fixture.tenantId, fixture.tenantRoleKey],
    );
    await admin.query(
      'INSERT INTO "RolePermission" ("roleId", "permissionId") VALUES ($1, $2)',
      [fixture.tenantRoleId, fixture.tenantPermissionId],
    );
    await admin.query(
      'INSERT INTO "MembershipRole" ("id", "tenantId", "membershipId", "roleId", "assignedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [
        randomUUID(),
        fixture.tenantId,
        fixture.membershipId,
        fixture.tenantRoleId,
      ],
    );
    await admin.query(
      'INSERT INTO "Role" ("id", "tenantId", "scope", "key", "name", "createdAt", "updatedAt") VALUES ($1, NULL, \'GLOBAL\', $2, \'Runtime global role\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [fixture.globalRoleId, fixture.globalRoleKey],
    );
    await admin.query(
      'INSERT INTO "GlobalRoleAssignment" ("id", "userId", "roleId", "assignedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [fixture.globalAssignmentId, userId, fixture.globalRoleId],
    );
    await admin.query(
      'INSERT INTO "GlobalRoleAssignment" ("id", "userId", "roleId", "assignedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [fixture.otherAssignmentId, fixture.otherUserId, fixture.globalRoleId],
    );
    const existingPlatformRole = await admin.query(
      'SELECT "id" FROM "Role" WHERE "tenantId" IS NULL AND "scope" = \'GLOBAL\' AND "key" = $1',
      [fixture.platformRoleKey],
    );
    fixture.platformRoleCreated = existingPlatformRole.rowCount === 0;
    if (fixture.platformRoleCreated) {
      await admin.query(
        'INSERT INTO "Role" ("id", "tenantId", "scope", "key", "name", "createdAt", "updatedAt") VALUES ($1, NULL, \'GLOBAL\', $2, \'Platform Admin\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [fixture.platformRoleId, fixture.platformRoleKey],
      );
    } else {
      fixture.platformRoleId = existingPlatformRole.rows[0].id;
    }
    const existingPlatformRolePermission = await admin.query(
      'SELECT 1 FROM "RolePermission" WHERE "roleId" = $1 AND "permissionId" = $2',
      [fixture.platformRoleId, fixture.platformPermissionId],
    );
    fixture.platformRolePermissionCreated =
      existingPlatformRolePermission.rowCount === 0;
    if (fixture.platformRolePermissionCreated) {
      await admin.query(
        'INSERT INTO "RolePermission" ("roleId", "permissionId") VALUES ($1, $2)',
        [fixture.platformRoleId, fixture.platformPermissionId],
      );
    }
    const existingPlatformAssignment = await admin.query(
      'SELECT "id" FROM "GlobalRoleAssignment" WHERE "userId" = $1 AND "roleId" = $2',
      [userId, fixture.platformRoleId],
    );
    fixture.platformAssignmentCreated =
      existingPlatformAssignment.rowCount === 0;
    if (fixture.platformAssignmentCreated) {
      await admin.query(
        'INSERT INTO "GlobalRoleAssignment" ("id", "userId", "roleId", "assignedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
        [fixture.platformAssignmentId, userId, fixture.platformRoleId],
      );
    } else {
      fixture.platformAssignmentId = existingPlatformAssignment.rows[0].id;
    }
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
  return fixture;
}

async function assertGlobalAssignmentRls(
  runtime,
  userId,
  otherUserId,
  fixtureAssignmentId,
  otherAssignmentId,
) {
  await runtime.query('BEGIN');
  try {
    const catalog = await runtime.query(
      `SELECT
        has_table_privilege(current_user, 'public."GlobalRoleAssignment"', 'SELECT') AS select_granted,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS rls_forced,
        (
          SELECT COUNT(*)::int
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'GlobalRoleAssignment'
            AND cmd = 'SELECT'
        ) AS select_policy_count,
        r.rolsuper AS superuser,
        r.rolbypassrls AS bypassrls,
        r.rolcanlogin AS canlogin
       FROM pg_class AS c
       JOIN pg_namespace AS n ON n.oid = c.relnamespace
       JOIN pg_roles AS r ON r.rolname = current_user
       WHERE n.nspname = 'public' AND c.relname = 'GlobalRoleAssignment'`,
    );
    const catalogState = catalog.rows[0];
    if (!catalogState)
      throw verifierFailure('GLOBAL_ROLE_ASSIGNMENT_CATALOG_UNAVAILABLE');
    console.log(
      `authorization_global_role_catalog=select=${catalogState.select_granted}|rls_enabled=${catalogState.rls_enabled}|rls_forced=${catalogState.rls_forced}|select_policy_count=${catalogState.select_policy_count}|superuser=${catalogState.superuser}|bypassrls=${catalogState.bypassrls}|canlogin=${catalogState.canlogin}`,
    );

    await runtime.query(
      `SELECT
        set_config('app.tenant_id', '', true),
        set_config('app.user_id', '', true),
        set_config('app.membership_id', '', true),
        set_config('app.operation_id', '', true),
        set_config('app.global_operation', 'false', true)`,
    );
    const unscopedContext = await runtime.query(
      'SELECT public.app_membership_selection_context_is_valid() AS context_valid',
    );
    const unscopedHelper = unscopedContext.rows[0]?.context_valid === true;
    console.log(
      `authorization_global_role_context=unscoped|helper=${unscopedHelper}`,
    );
    if (unscopedHelper)
      throw verifierFailure('GLOBAL_ROLE_UNSCOPED_CONTEXT_VALID');

    let unscoped;
    try {
      unscoped = await runtime.query(
        'SELECT "userId" FROM "GlobalRoleAssignment"',
      );
      console.log(
        `authorization_global_role_rls_query=unscoped|status=PASS|row_count=${unscoped.rowCount}`,
      );
    } catch (error) {
      console.error(
        `authorization_global_role_rls_query=unscoped|status=ERROR|sqlstate=${databaseErrorCode(error)}`,
      );
      throw error;
    }
    if (unscoped.rowCount !== 0) {
      throw verifierFailure('GLOBAL_ROLE_ASSIGNMENT_UNSCOPED_READ_FAILED');
    }

    await runtime.query(
      `SELECT
        set_config('app.tenant_id', '', true),
        set_config('app.user_id', $1, true),
        set_config('app.membership_id', '', true),
        set_config('app.operation_id', $2, true),
        set_config('app.global_operation', 'false', true)`,
      [userId, randomUUID()],
    );
    const authenticatedContext = await runtime.query(
      'SELECT public.app_membership_selection_context_is_valid() AS context_valid',
    );
    const authenticatedHelper =
      authenticatedContext.rows[0]?.context_valid === true;
    console.log(
      `authorization_global_role_context=authenticated|helper=${authenticatedHelper}`,
    );
    if (!authenticatedHelper) {
      throw verifierFailure('GLOBAL_ROLE_AUTHENTICATED_CONTEXT_INVALID');
    }

    let visible;
    try {
      visible = await runtime.query(
        'SELECT "id", "userId" FROM "GlobalRoleAssignment" ORDER BY "userId", "id"',
      );
      console.log(
        `authorization_global_role_rls_query=authenticated|status=PASS|row_count=${visible.rowCount}`,
      );
    } catch (error) {
      console.error(
        `authorization_global_role_rls_query=authenticated|status=ERROR|sqlstate=${databaseErrorCode(error)}`,
      );
      throw error;
    }
    const ownVisible = visible.rows.some(
      (row) => row.id === fixtureAssignmentId && row.userId === userId,
    );
    const otherVisible = visible.rows.some(
      (row) => row.id === otherAssignmentId || row.userId === otherUserId,
    );
    if (!ownVisible || otherVisible) {
      throw verifierFailure('GLOBAL_ROLE_ASSIGNMENT_RLS_BOUNDARY_FAILED');
    }
    await runtime.query('COMMIT');
    return {
      ownVisible,
      otherVisible,
      visibleRowCount: visible.rowCount,
      unscopedHidden: true,
    };
  } catch (error) {
    await runtime.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function logoutIfNeeded(loggedIn) {
  if (!loggedIn?.jar?.has(cookieName)) return;
  try {
    const response = await request(
      `${apiBaseUrl}/api/v1/auth/logout`,
      {
        method: 'POST',
        headers: { origin, 'x-csrf-token': loggedIn.csrfToken },
      },
      loggedIn.jar,
    );
    if (response.status !== 204) {
      console.error('authorization_session_cleanup_status=FAIL');
    }
  } catch {
    console.error('authorization_session_cleanup_status=FAIL');
  }
}

async function cleanupStaleAuthorizationFixtures(admin, protectedUserId) {
  const staleTenants = await admin.query(
    `SELECT "id"
     FROM "Tenant"
     WHERE "slug" LIKE 'phase2-authz-%'
       AND "name" = 'Phase 2 authorization runtime fixture'
       AND "status" <> 'ARCHIVED'`,
  );
  let cleanedTenants = 0;
  let retainedAuditEvents = 0;
  for (const tenant of staleTenants.rows) {
    await admin.query('BEGIN');
    try {
      const roles = await admin.query(
        `SELECT "id"
         FROM "Role"
         WHERE "tenantId" = $1
            OR ("tenantId" IS NULL AND "key" LIKE 'phase2_runtime_global_%')`,
        [tenant.id],
      );
      const memberships = await admin.query(
        'SELECT "id", "userId" FROM "Membership" WHERE "tenantId" = $1',
        [tenant.id],
      );
      const fixtureUserIds = memberships.rows
        .map((membership) => membership.userId)
        .filter((userId) => userId !== protectedUserId);
      const roleIds = roles.rows.map((role) => role.id);
      retainedAuditEvents += Number(
        (
          await admin.query(
            'SELECT COUNT(*)::int AS count FROM "AuditEvent" WHERE "tenantId" = $1',
            [tenant.id],
          )
        ).rows[0]?.count ?? 0,
      );
      await admin.query('DELETE FROM "OutboxMessage" WHERE "tenantId" = $1', [
        tenant.id,
      ]);
      await admin.query('DELETE FROM "IdempotencyKey" WHERE "tenantId" = $1', [
        tenant.id,
      ]);
      await admin.query('DELETE FROM "AccessDenial" WHERE "tenantId" = $1', [
        tenant.id,
      ]);
      await admin.query('DELETE FROM "MembershipRole" WHERE "tenantId" = $1', [
        tenant.id,
      ]);
      await admin.query(
        'DELETE FROM "GlobalRoleAssignment" WHERE "roleId" = ANY($1::text[])',
        [roleIds],
      );
      await admin.query(
        'DELETE FROM "RolePermission" WHERE "roleId" = ANY($1::text[])',
        [roleIds],
      );
      await admin.query(
        `UPDATE "AppSession"
         SET "activeTenantId" = NULL,
             "activeMembershipId" = NULL,
             "contextVersion" = "contextVersion" + 1
         WHERE "activeTenantId" = $1`,
        [tenant.id],
      );
      await admin.query(
        `UPDATE "Membership"
         SET "status" = 'REMOVED',
             "removedAt" = COALESCE("removedAt", CURRENT_TIMESTAMP),
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "tenantId" = $1`,
        [tenant.id],
      );
      await admin.query(
        `UPDATE "Tenant"
         SET "status" = 'ARCHIVED',
             "archivedAt" = COALESCE("archivedAt", CURRENT_TIMESTAMP),
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        [tenant.id],
      );
      if (roleIds.length > 0) {
        await admin.query('DELETE FROM "Role" WHERE "id" = ANY($1::text[])', [
          roleIds,
        ]);
      }
      if (fixtureUserIds.length > 0) {
        await admin.query(
          `DELETE FROM "User"
           WHERE "id" = ANY($1::text[])
             AND "status" = 'PENDING'
             AND NOT EXISTS (SELECT 1 FROM "ExternalIdentity" WHERE "userId" = "User"."id")
             AND NOT EXISTS (SELECT 1 FROM "AppSession" WHERE "userId" = "User"."id")
             AND NOT EXISTS (SELECT 1 FROM "Membership" WHERE "userId" = "User"."id")
             AND NOT EXISTS (SELECT 1 FROM "IdempotencyKey" WHERE "userId" = "User"."id")
             AND NOT EXISTS (SELECT 1 FROM "AuditEvent" WHERE "actorUserId" = "User"."id")`,
          [fixtureUserIds],
        );
      }
      await admin.query('COMMIT');
      cleanedTenants += 1;
    } catch (error) {
      await admin.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }
  return { cleanedTenants, retainedAuditEvents };
}

async function cleanupFixtures(admin, fixture, userId) {
  const roleIds = [fixture.tenantRoleId, fixture.globalRoleId];
  const rolePermissionIds = [fixture.tenantRoleId];
  const assignmentIds = [fixture.globalAssignmentId, fixture.otherAssignmentId];
  if (fixture.platformAssignmentCreated)
    assignmentIds.push(fixture.platformAssignmentId);
  if (fixture.platformRoleCreated) roleIds.push(fixture.platformRoleId);
  if (fixture.platformRolePermissionCreated)
    rolePermissionIds.push(fixture.platformRoleId);
  await admin.query('BEGIN');
  try {
    await admin.query('DELETE FROM "OutboxMessage" WHERE "tenantId" = $1', [
      fixture.tenantId,
    ]);
    await admin.query('DELETE FROM "IdempotencyKey" WHERE "tenantId" = $1', [
      fixture.tenantId,
    ]);
    await admin.query(
      'DELETE FROM "MembershipRole" WHERE "membershipId" = $1',
      [fixture.membershipId],
    );
    await admin.query(
      'DELETE FROM "GlobalRoleAssignment" WHERE "id" = ANY($1::text[])',
      [assignmentIds],
    );
    await admin.query(
      'DELETE FROM "RolePermission" WHERE "roleId" = ANY($1::text[])',
      [rolePermissionIds],
    );
    await admin.query('DELETE FROM "Role" WHERE "id" = ANY($1::text[])', [
      roleIds,
    ]);
    await admin.query(
      `UPDATE "AppSession"
       SET "activeTenantId" = NULL,
           "activeMembershipId" = NULL,
           "contextVersion" = "contextVersion" + 1
       WHERE "userId" = $1 AND "activeTenantId" = $2`,
      [userId, fixture.tenantId],
    );
    await admin.query(
      `UPDATE "Membership"
       SET "status" = 'REMOVED',
           "removedAt" = COALESCE("removedAt", CURRENT_TIMESTAMP),
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "tenantId" = $2`,
      [fixture.membershipId, fixture.tenantId],
    );
    await admin.query(
      `UPDATE "Tenant"
       SET "status" = 'ARCHIVED',
           "archivedAt" = COALESCE("archivedAt", CURRENT_TIMESTAMP),
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      [fixture.tenantId],
    );
    await admin.query('DELETE FROM "User" WHERE "id" = $1', [
      fixture.otherUserId,
    ]);
    await admin.query(
      'UPDATE "User" SET "status" = $2::"UserStatus", "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1',
      [userId, fixture.originalUserStatus],
    );
    await admin.query('COMMIT');
    const residue = await admin.query(
      `SELECT
        (SELECT COUNT(*) FROM "Tenant" WHERE "id" = $1 AND "status" <> 'ARCHIVED') AS active_tenant_count,
        (SELECT COUNT(*) FROM "Membership" WHERE "id" = $2 AND "status" <> 'REMOVED') AS active_membership_count,
        (SELECT COUNT(*) FROM "Role" WHERE "id" = ANY($3::text[])) AS role_count,
        (SELECT COUNT(*) FROM "MembershipRole" WHERE "membershipId" = $2) AS membership_role_count,
        (SELECT COUNT(*) FROM "GlobalRoleAssignment" WHERE "id" = ANY($4::text[])) AS global_assignment_count,
        (SELECT COUNT(*) FROM "AuditEvent" WHERE "tenantId" = $1) AS audit_count,
        (SELECT COUNT(*) FROM "OutboxMessage" WHERE "tenantId" = $1) AS outbox_count,
        (SELECT COUNT(*) FROM "IdempotencyKey" WHERE "tenantId" = $1) AS idempotency_count,
        (SELECT COUNT(*) FROM "User" WHERE "id" = $5) AS fixture_user_count`,
      [
        fixture.tenantId,
        fixture.membershipId,
        roleIds,
        assignmentIds,
        fixture.otherUserId,
      ],
    );
    const state = Object.fromEntries(
      Object.entries(residue.rows[0] ?? {}).map(([key, value]) => [
        key,
        Number(value),
      ]),
    );
    if (
      state.active_tenant_count !== 0 ||
      state.active_membership_count !== 0 ||
      state.role_count !== 0 ||
      state.membership_role_count !== 0 ||
      state.global_assignment_count !== 0 ||
      state.outbox_count !== 0 ||
      state.idempotency_count !== 0 ||
      state.fixture_user_count !== 0 ||
      state.audit_count > 1
    ) {
      throw verifierFailure('AUTHORIZATION_FIXTURE_RESIDUE');
    }
    return state;
  } catch (error) {
    await admin.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function main() {
  required('DATABASE_URL', databaseUrl);
  required('MIGRATION_DATABASE_URL', migrationDatabaseUrl);
  required('AUTH_RUNTIME_USERNAME', username);
  required('AUTH_RUNTIME_PASSWORD', password);

  const admin = new Client({ connectionString: migrationDatabaseUrl });
  const runtime = new Client({ connectionString: databaseUrl });
  let fixture;
  let loggedIn;
  let stage = 'connect';
  try {
    await admin.connect();
    await runtime.connect();
    loggedIn = await login();
    const userId = loggedIn.session.user.id;
    stage = 'stale_fixture_cleanup';
    const staleCleanup = await cleanupStaleAuthorizationFixtures(admin, userId);
    if (staleCleanup.cleanedTenants > 0) {
      console.log(
        `authorization_stale_fixture_cleanup_status=PASS|archived_tenants=${staleCleanup.cleanedTenants}|retained_audit_events=${staleCleanup.retainedAuditEvents}|audit_append_only=true`,
      );
    }
    stage = 'provision_fixtures';
    fixture = await provisionFixtures(admin, userId);

    stage = 'tenant_switch';
    const contextVersion = loggedIn.session.tenantContext?.contextVersion ?? 0;
    const switchResponse = await request(
      `${apiBaseUrl}/api/v1/session/tenant-switch`,
      {
        method: 'POST',
        headers: {
          origin,
          'content-type': 'application/json',
          'x-csrf-token': loggedIn.csrfToken,
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({
          tenantId: fixture.tenantId,
          expectedContextVersion: contextVersion,
        }),
      },
      loggedIn.jar,
    );
    requireStatus(switchResponse, 200, 'TENANT_SWITCH');
    const switched = unwrap(await readJson(switchResponse, 'TENANT_SWITCH'));
    if (
      switched.tenantId !== fixture.tenantId ||
      switched.membershipId !== fixture.membershipId
    ) {
      throw new Error('TENANT_SWITCH_RESULT_INVALID');
    }
    console.log(
      'authorization_tenant_switch_status=PASS|server_validated=true|policy=CanSwitchTenant',
    );

    stage = 'access_projection';
    const accessResponse = await request(
      `${apiBaseUrl}/api/v1/authorization/access`,
      {},
      loggedIn.jar,
    );
    requireStatus(accessResponse, 200, 'AUTHORIZATION_ACCESS');
    const access = unwrap(
      await readJson(accessResponse, 'AUTHORIZATION_ACCESS'),
    );
    if (
      !access ||
      access.tenantId !== fixture.tenantId ||
      access.membershipId !== fixture.membershipId ||
      !access.roles.includes(fixture.tenantRoleKey) ||
      !access.roles.includes(fixture.globalRoleKey) ||
      !access.permissions.includes(fixture.permissionKey) ||
      Object.prototype.hasOwnProperty.call(access, 'tokenHash')
    ) {
      throw new Error('AUTHORIZATION_ACCESS_PROJECTION_INVALID');
    }
    console.log(
      'authorization_access_status=PASS|tenant_role_visible=true|global_role_visible=true|permission_visible=true|allowlisted=true',
    );

    stage = 'administrative_mfa';
    const mfaResponse = await request(
      `${apiBaseUrl}/api/v1/authorization/users/${fixture.otherUserId}/sessions/revoke`,
      {
        method: 'POST',
        headers: {
          origin,
          'content-type': 'application/json',
          'x-csrf-token': loggedIn.csrfToken,
          'idempotency-key': fixture.mfaIdempotencyKey,
        },
        body: JSON.stringify({}),
      },
      loggedIn.jar,
    );
    const mfaBody = await readJson(mfaResponse, 'ADMINISTRATIVE_MFA');
    const mfaErrorCode = mfaBody?.error?.code ?? 'none';
    if (
      mfaResponse.status !== 403 ||
      mfaBody?.success !== false ||
      mfaErrorCode !== 'MFA_STEP_UP_REQUIRED'
    ) {
      throw verifierFailure(
        `ADMINISTRATIVE_MFA_DENIAL_INVALID_${mfaResponse.status}_${mfaErrorCode}`,
      );
    }
    console.log(
      'authorization_mfa_sensitive_status=PASS|missing_mfa_denied=true|http=403|error_code=MFA_STEP_UP_REQUIRED|provider_claim_not_fabricated=true',
    );

    stage = 'global_role_rls';
    const rls = await assertGlobalAssignmentRls(
      runtime,
      userId,
      fixture.otherUserId,
      fixture.globalAssignmentId,
      fixture.otherAssignmentId,
    );
    const policyState = await admin.query(
      `SELECT c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
       FROM pg_class AS c
       JOIN pg_namespace AS n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'GlobalRoleAssignment'`,
    );
    if (
      policyState.rowCount !== 1 ||
      policyState.rows[0].enabled !== true ||
      policyState.rows[0].forced !== true
    ) {
      throw new Error('GLOBAL_ROLE_ASSIGNMENT_RLS_STATE_INVALID');
    }
    console.log(
      `authorization_global_role_rls_status=PASS|own_assignment_visible=${rls.ownVisible}|other_assignment_hidden=${rls.otherVisible === false}|unscoped_hidden=${rls.unscopedHidden}|visible_row_count=${rls.visibleRowCount}|enabled=true|forced=true`,
    );

    stage = 'logout';
    const logout = await request(
      `${apiBaseUrl}/api/v1/auth/logout`,
      {
        method: 'POST',
        headers: { origin, 'x-csrf-token': loggedIn.csrfToken },
      },
      loggedIn.jar,
    );
    requireStatus(logout, 204, 'LOGOUT');
    console.log('authorization_session_cleanup_status=PASS|logout=204');
    stage = 'cleanup';
    const cleanupState = await cleanupFixtures(admin, fixture, userId);
    fixture = undefined;
    console.log(
      `authorization_fixture_cleanup_status=PASS|audit_retained=${cleanupState.audit_count}|audit_append_only=true|active_fixture_tenants=${cleanupState.active_tenant_count}|active_fixture_memberships=${cleanupState.active_membership_count}|outbox_residue=${cleanupState.outbox_count}|idempotency_residue=${cleanupState.idempotency_count}`,
    );
    console.log('phase2_authorization_runtime_result=PASS');
  } catch (error) {
    console.error(
      `phase2_authorization_runtime_result=FAIL|stage=${stage}|error_class=${error instanceof Error ? error.name : 'UnknownError'}|error_code=${databaseErrorCode(error)}|verifier_code=${error && typeof error === 'object' && 'verifierCode' in error && typeof error.verifierCode === 'string' ? error.verifierCode : 'none'}`,
    );
    process.exitCode = 1;
  } finally {
    await logoutIfNeeded(loggedIn);
    if (fixture) {
      try {
        const userId = loggedIn?.session?.user?.id;
        if (userId) await cleanupFixtures(admin, fixture, userId);
      } catch (error) {
        console.error(
          `authorization_fixture_cleanup_status=FAIL|error_class=${error instanceof Error ? error.name : 'UnknownError'}|error_code=${error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'none'}`,
        );
      }
    }
    await runtime.end().catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

await Promise.race([
  main(),
  new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('AUTHORIZATION_RUNTIME_TIMEOUT')),
      timeoutMs,
    ),
  ),
]);
