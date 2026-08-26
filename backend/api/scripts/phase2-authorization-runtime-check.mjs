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
    otherUserId: randomUUID(),
    otherAssignmentId: randomUUID(),
    tenantPermissionId: randomUUID(),
    globalPermissionId: randomUUID(),
    tenantSlug: `phase2-authz-${randomUUID().slice(0, 8)}`,
    globalRoleKey: `phase2_runtime_global_${randomUUID().slice(0, 8)}`,
    tenantRoleKey: `tenant_admin`,
    permissionKey: `tenant.read`,
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
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
  return fixture;
}

async function assertGlobalAssignmentRls(runtime, userId, otherUserId) {
  await runtime.query('BEGIN');
  try {
    await runtime.query(
      `SELECT
        set_config('app.tenant_id', '', true),
        set_config('app.user_id', '', true),
        set_config('app.membership_id', '', true),
        set_config('app.operation_id', '', true),
        set_config('app.global_operation', 'false', true)`,
    );
    const unscoped = await runtime.query(
      'SELECT "userId" FROM "GlobalRoleAssignment"',
    );
    if (unscoped.rowCount !== 0) {
      throw new Error('GLOBAL_ROLE_ASSIGNMENT_UNSCOPED_READ_FAILED');
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
    const visible = await runtime.query(
      'SELECT "userId" FROM "GlobalRoleAssignment" ORDER BY "userId"',
    );
    const ownVisible = visible.rows.some((row) => row.userId === userId);
    const otherVisible = visible.rows.some((row) => row.userId === otherUserId);
    if (!ownVisible || otherVisible || visible.rowCount !== 1) {
      throw new Error('GLOBAL_ROLE_ASSIGNMENT_RLS_BOUNDARY_FAILED');
    }
    await runtime.query('COMMIT');
    return { ownVisible, otherVisible, unscopedHidden: true };
  } catch (error) {
    await runtime.query('ROLLBACK');
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

async function cleanupFixtures(admin, fixture, userId) {
  await admin.query('BEGIN');
  try {
    await admin.query(
      'DELETE FROM "MembershipRole" WHERE "membershipId" = $1',
      [fixture.membershipId],
    );
    await admin.query(
      'DELETE FROM "GlobalRoleAssignment" WHERE "id" IN ($1, $2)',
      [fixture.globalAssignmentId, fixture.otherAssignmentId],
    );
    await admin.query(
      'DELETE FROM "RolePermission" WHERE "roleId" IN ($1, $2)',
      [fixture.tenantRoleId, fixture.globalRoleId],
    );
    await admin.query('DELETE FROM "Role" WHERE "id" IN ($1, $2)', [
      fixture.tenantRoleId,
      fixture.globalRoleId,
    ]);
    await admin.query('DELETE FROM "Membership" WHERE "id" = $1', [
      fixture.membershipId,
    ]);
    await admin.query('DELETE FROM "Tenant" WHERE "id" = $1', [
      fixture.tenantId,
    ]);
    await admin.query('DELETE FROM "User" WHERE "id" = $1', [
      fixture.otherUserId,
    ]);
    await admin.query(
      'UPDATE "User" SET "status" = $2::"UserStatus", "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1',
      [userId, fixture.originalUserStatus],
    );
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
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
    stage = 'provision_fixtures';
    const userId = loggedIn.session.user.id;
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

    stage = 'global_role_rls';
    const rls = await assertGlobalAssignmentRls(
      runtime,
      userId,
      fixture.otherUserId,
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
      `authorization_global_role_rls_status=PASS|own_assignment_visible=${rls.ownVisible}|other_assignment_hidden=${rls.otherVisible === false}|unscoped_hidden=${rls.unscopedHidden}|enabled=true|forced=true`,
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
    await cleanupFixtures(admin, fixture, userId);
    fixture = undefined;
    console.log('authorization_fixture_cleanup_status=PASS');
    console.log('phase2_authorization_runtime_result=PASS');
  } catch (error) {
    console.error(
      `phase2_authorization_runtime_result=FAIL|stage=${stage}|error_class=${error instanceof Error ? error.name : 'UnknownError'}`,
    );
    process.exitCode = 1;
  } finally {
    await logoutIfNeeded(loggedIn);
    if (fixture) {
      try {
        const userId = loggedIn?.session?.user?.id;
        if (userId) await cleanupFixtures(admin, fixture, userId);
      } catch {
        console.error('authorization_fixture_cleanup_status=FAIL');
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
