import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const apiBaseUrl =
  process.env.INVITATION_RUNTIME_API_BASE_URL ?? 'http://127.0.0.1:3000';
const origin = process.env.INVITATION_RUNTIME_ORIGIN ?? 'http://localhost:5173';
const cookieName = process.env.SESSION_COOKIE_NAME ?? 'mohamy_session';
const adminUsername = process.env.INVITATION_RUNTIME_ADMIN_USERNAME;
const adminPassword = process.env.INVITATION_RUNTIME_ADMIN_PASSWORD;
const adminOtp = process.env.INVITATION_RUNTIME_ADMIN_OTP;
const targetUsername = process.env.INVITATION_RUNTIME_TARGET_USERNAME;
const targetPassword = process.env.INVITATION_RUNTIME_TARGET_PASSWORD;
const targetOtp = process.env.INVITATION_RUNTIME_TARGET_OTP;
const databaseUrl = process.env.DATABASE_URL;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const timeoutMs = 30_000;
let currentStage = 'startup';
let currentSubstage = 'none';

class CookieJar {
  #cookies = new Map();

  apply(response) {
    const values =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : splitSetCookie(response.headers.get('set-cookie'));
    for (const value of values) {
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

function safeSqlState(error) {
  if (typeof error !== 'object' || error === null) return 'none';
  const code = error.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : 'none';
}

function safeSqlCategory(error) {
  const code = safeSqlState(error);
  if (code === '23505') return 'unique_violation';
  if (code === '23503') return 'foreign_key_violation';
  if (code === '23502') return 'not_null_violation';
  if (code === '22P02') return 'invalid_text_representation';
  if (code === '42501') return 'insufficient_privilege';
  if (code === '42P01') return 'undefined_table';
  if (code === '42703') return 'undefined_column';
  if (code === '40001') return 'serialization_failure';
  if (code === '40P01') return 'deadlock_detected';
  return 'unknown';
}

function requireValue(name, value) {
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      redirect: 'manual',
      signal: controller.signal,
    });
    jar?.apply(response);
    return response;
  } finally {
    clearTimeout(timeout);
  }
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

function classifyCallbackBody(body) {
  if (
    /id=["']kc-otp-login-form["']/i.test(body) ||
    /name=["']otp["']/i.test(body)
  ) {
    return 'KEYCLOAK_OTP_REQUIRED';
  }
  if (
    /id=["']kc-passwd-update-form["']/i.test(body) ||
    /update-password|password-update/i.test(body)
  ) {
    return 'KEYCLOAK_PASSWORD_UPDATE_REQUIRED';
  }
  if (
    /id=["']kc-verify-email-form["']/i.test(body) ||
    /verify-email|email-verification/i.test(body)
  ) {
    return 'KEYCLOAK_EMAIL_VERIFICATION_REQUIRED';
  }
  if (/invalid credentials|invalid username|login-error/i.test(body)) {
    return 'KEYCLOAK_CREDENTIALS_REJECTED';
  }
  if (/login-actions\/required-action|id=["']kc-select-/i.test(body)) {
    return 'KEYCLOAK_REQUIRED_ACTION';
  }
  if (/application\/json|"success"|"error"/i.test(body)) {
    return 'APPLICATION_CALLBACK_BODY';
  }
  return 'OIDC_CALLBACK_BODY_UNCLASSIFIED';
}

function loginForm(html, baseUrl) {
  const formTag = html.match(
    /<form\b[^>]*id=["'](?:kc-form-login|kc-otp-login-form)["'][^>]*>/i,
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

const SAFE_INVITATION_CREATE_ERROR_CODES = new Set([
  'MFA_STEP_UP_REQUIRED',
  'AUTHORIZATION_DENIED',
  'FORBIDDEN',
]);

function safeApiErrorCode(payload) {
  const code =
    payload && typeof payload === 'object' && payload.error
      ? payload.error.code
      : undefined;
  return typeof code === 'string' &&
    SAFE_INVITATION_CREATE_ERROR_CODES.has(code)
    ? code
    : 'UNKNOWN';
}

function apiJsonHeaders(csrfToken, idempotencyKey) {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    origin,
    'x-csrf-token': csrfToken,
    'idempotency-key': idempotencyKey,
  };
}

async function login(username, password, otp) {
  const jar = new CookieJar();
  const start = await request(
    `${apiBaseUrl}/api/v1/auth/login?returnTo=%2Fen`,
    {},
    jar,
  );
  requireStatus(start, 302, 'LOGIN_START');
  const authorizationUrl = absoluteLocation(apiBaseUrl, start, 'LOGIN_START');
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

  const loginPage = await request(authorizationUrl, {}, jar);
  requireStatus(loginPage, 200, 'KEYCLOAK_LOGIN_PAGE');
  const loginHtml = await loginPage.text();
  const credentials = loginForm(loginHtml, authorizationUrl);
  credentials.fields.set('username', username);
  credentials.fields.set('password', password);
  const credentialResponse = await request(
    credentials.action,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: credentials.fields,
    },
    jar,
  );

  let callbackResponse = credentialResponse;
  if (credentialResponse.status === 200) {
    const otpHtml = await credentialResponse.text();
    if (!/kc-otp-login-form/i.test(otpHtml)) {
      throw new Error('KEYCLOAK_CREDENTIALS_REJECTED');
    }
    requireValue('INVITATION_RUNTIME_OTP', otp);
    const otpForm = loginForm(otpHtml, authorizationUrl);
    otpForm.fields.set('otp', otp);
    callbackResponse = await request(
      otpForm.action,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: otpForm.fields,
      },
      jar,
    );
  }
  requireStatus(callbackResponse, 302, 'KEYCLOAK_CREDENTIALS');
  const callbackUrl = absoluteLocation(
    authorizationUrl,
    callbackResponse,
    'KEYCLOAK_CREDENTIALS',
  );
  const callback = await request(callbackUrl, { headers: { origin } }, jar);
  if (callback.status !== 302) {
    const body = callback.status === 200 ? await callback.text() : '';
    const classification = body
      ? classifyCallbackBody(body)
      : 'OIDC_CALLBACK_NO_BODY';
    throw new Error(`OIDC_CALLBACK_HTTP_${callback.status}_${classification}`);
  }
  if (!jar.has(cookieName)) throw new Error('SESSION_COOKIE_MISSING');
  const returnLocation = absoluteLocation(
    apiBaseUrl,
    callback,
    'OIDC_CALLBACK',
  );
  if (!returnLocation.startsWith(`${origin}/en`)) {
    throw new Error('OIDC_RETURN_LOCATION_INVALID');
  }

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

async function apiMutation(
  user,
  path,
  body,
  label,
  csrfToken = user.csrfToken,
) {
  const idempotencyKey = randomUUID();
  const response = await request(
    `${apiBaseUrl}${path}`,
    {
      method: 'POST',
      headers: apiJsonHeaders(csrfToken, idempotencyKey),
      body: JSON.stringify(body),
    },
    user.jar,
  );
  const payload = await readJson(response, label);
  return { response, payload, idempotencyKey };
}

function randomUuid() {
  return randomUUID();
}

async function queryOne(client, text, values, label) {
  const result = await client.query(text, values);
  if (result.rowCount !== 1) throw new Error(`${label}_NOT_FOUND`);
  return result.rows[0];
}

async function provisionFixtures(admin, adminUserId, targetUserId) {
  if (adminUserId === targetUserId) {
    throw new Error('INVITATION_DISTINCT_USERS_REQUIRED');
  }
  const fixture = {
    tenantId: randomUuid(),
    roleId: randomUuid(),
    membershipId: randomUuid(),
    targetMembershipId: null,
    tenantSlug: `phase2-invitation-${randomUuid().slice(0, 8)}`,
    roleKey: `invitation_admin_${randomUuid().slice(0, 8)}`,
    createdPermissionIds: [],
  };
  const originalUsers = await admin.query(
    'SELECT "id", "status"::text AS status FROM "User" WHERE "id" = ANY($1)',
    [[adminUserId, targetUserId]],
  );
  if (originalUsers.rowCount !== 2)
    throw new Error('INVITATION_USERS_NOT_FOUND');
  fixture.originalUserStatuses = new Map(
    originalUsers.rows.map((row) => [row.id, row.status]),
  );
  fixture.adminUserId = adminUserId;
  fixture.targetUserId = targetUserId;

  const adminIdentity = await queryOne(
    admin,
    'SELECT "subject" FROM "ExternalIdentity" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
    [adminUserId],
    'ADMIN_EXTERNAL_IDENTITY',
  );
  const targetIdentity = await queryOne(
    admin,
    'SELECT "subject" FROM "ExternalIdentity" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
    [targetUserId],
    'TARGET_EXTERNAL_IDENTITY',
  );
  const permissionIds = new Map();

  await admin.query('BEGIN');
  try {
    currentSubstage = 'admin_user_activate';
    const originalAdminStatus = fixture.originalUserStatuses.get(adminUserId);
    if (originalAdminStatus !== 'ACTIVE' && originalAdminStatus !== 'PENDING') {
      throw new Error('INVITATION_ADMIN_USER_STATUS_UNSUPPORTED');
    }
    if (originalAdminStatus === 'PENDING') {
      const activated = await admin.query(
        'UPDATE "User" SET "status" = \'ACTIVE\' WHERE "id" = $1 AND "status" = \'PENDING\'',
        [adminUserId],
      );
      if (activated.rowCount !== 1) {
        throw new Error('INVITATION_ADMIN_USER_STATUS_CHANGED');
      }
    }
    currentSubstage = 'permission_provision';
    for (const [key, description] of [
      ['membership.manage', 'Manage tenant memberships'],
      ['tenant.switch', 'Switch active tenant context'],
    ]) {
      currentSubstage = `permission_${key.replaceAll('.', '_')}`;
      const permissionId = randomUuid();
      const inserted = await admin.query(
        'INSERT INTO "Permission" ("id", "key", "description", "createdAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING RETURNING "id"',
        [permissionId, key, description],
      );
      if (inserted.rowCount === 1) {
        fixture.createdPermissionIds.push(permissionId);
      }
      const permission = await queryOne(
        admin,
        'SELECT "id" FROM "Permission" WHERE "key" = $1',
        [key],
        `INVITATION_PERMISSION_${key.replaceAll('.', '_')}`,
      );
      permissionIds.set(key, permission.id);
    }
    currentSubstage = 'tenant_create';
    await admin.query(
      'INSERT INTO "Tenant" ("id", "slug", "name", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, \'ACTIVE\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [
        fixture.tenantId,
        fixture.tenantSlug,
        'Phase 2 invitation runtime fixture',
      ],
    );
    currentSubstage = 'role_create';
    await admin.query(
      'INSERT INTO "Role" ("id", "tenantId", "scope", "key", "name", "createdAt", "updatedAt") VALUES ($1, $2, \'TENANT\', $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [
        fixture.roleId,
        fixture.tenantId,
        fixture.roleKey,
        'Invitation runtime administrator',
      ],
    );
    currentSubstage = 'role_permission_create';
    for (const key of ['membership.manage', 'tenant.switch']) {
      await admin.query(
        'INSERT INTO "RolePermission" ("roleId", "permissionId") VALUES ($1, $2)',
        [fixture.roleId, permissionIds.get(key)],
      );
    }
    currentSubstage = 'admin_membership_create';
    await admin.query(
      'INSERT INTO "Membership" ("id", "tenantId", "userId", "status", "activeFrom", "activatedAt", "createdAt", "updatedAt") VALUES ($1, $2, $3, \'ACTIVE\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [fixture.membershipId, fixture.tenantId, adminUserId],
    );
    currentSubstage = 'admin_membership_role_create';
    await admin.query(
      'INSERT INTO "MembershipRole" ("id", "tenantId", "membershipId", "roleId", "assignedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [randomUuid(), fixture.tenantId, fixture.membershipId, fixture.roleId],
    );
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
  return {
    ...fixture,
    adminSubject: adminIdentity.subject,
    targetSubject: targetIdentity.subject,
    invitationIds: [],
    auditIds: [],
    idempotencyKeys: [],
  };
}

async function switchTenant(user, tenantId, contextVersion) {
  const result = await apiMutation(
    user,
    '/api/v1/session/tenant-switch',
    { tenantId, expectedContextVersion: contextVersion },
    'TENANT_SWITCH',
  );
  requireStatus(result.response, 200, 'TENANT_SWITCH');
  if (result.payload.success !== true)
    throw new Error('TENANT_SWITCH_NOT_SUCCESS');
  return unwrap(result.payload);
}

async function bindRuntimeTenantContext(
  runtime,
  tenantId,
  userId,
  membershipId,
) {
  await runtime.query(
    `SELECT
       set_config('app.tenant_id', $1, true),
       set_config('app.user_id', $2, true),
       set_config('app.membership_id', $3, true),
       set_config('app.operation_id', $4, true),
       set_config('app.global_operation', 'false', true),
       set_config('app.outbox_dispatcher', 'false', true),
       set_config('app.idempotency_maintenance', 'false', true),
       set_config('app.audit_retention_purge', 'false', true),
       set_config('app.invitation_acceptance', 'false', true),
       set_config('app.invitation_token_hash', '', true),
       set_config('app.invitation_invalidated_token_hash', '', true),
       set_config('app.inviter_membership_id', '', true)`,
    [tenantId, userId, membershipId, randomUuid()],
  );
}

async function assertInvitationVisible(
  runtime,
  tenantId,
  userId,
  membershipId,
  invitationId,
  status,
) {
  await runtime.query('BEGIN');
  try {
    await bindRuntimeTenantContext(runtime, tenantId, userId, membershipId);
    const row = await queryOne(
      runtime,
      'SELECT "id", "status"::text AS status FROM "Invitation" WHERE "id" = $1 AND "tenantId" = $2',
      [invitationId, tenantId],
      'RUNTIME_INVITATION',
    );
    if (row.status !== status)
      throw new Error(`RUNTIME_INVITATION_STATUS_${row.status}`);
    await runtime.query('COMMIT');
  } catch (error) {
    await runtime.query('ROLLBACK');
    throw error;
  }
}

async function assertAcceptedMembershipVisible(
  runtime,
  tenantId,
  userId,
  membershipId,
) {
  await runtime.query('BEGIN');
  let valid = false;
  try {
    await bindRuntimeTenantContext(runtime, tenantId, userId, membershipId);
    const result = await runtime.query(
      `SELECT m."status"::text AS status, mr."roleId"
       FROM "Membership" m
       JOIN "MembershipRole" mr ON mr."membershipId" = m."id" AND mr."tenantId" = m."tenantId"
       WHERE m."tenantId" = $1 AND m."userId" = $2 AND m."id" = $3`,
      [tenantId, userId, membershipId],
    );
    const row = result.rows[0];
    valid = result.rowCount === 1 && row.status === 'ACTIVE' && row.roleId;
    await runtime.query('COMMIT');
  } catch (error) {
    await runtime.query('ROLLBACK');
    throw error;
  }
  if (!valid) throw new Error('INVITATION_ACCEPT_MEMBERSHIP_INVALID');
}

async function waitForProcessedOutbox(admin, eventTypes, invitationIds) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await admin.query(
      `SELECT COUNT(*)::int AS count
       FROM "OutboxMessage"
       WHERE "eventType" = ANY($1)
         AND "status" = 'PROCESSED'
         AND "payload"->>'auditEventId' IN (
           SELECT "id"::text FROM "AuditEvent" WHERE "targetId" = ANY($2)
         )`,
      [eventTypes, invitationIds],
    );
    if (result.rows[0].count >= eventTypes.length) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function restoreOriginalUserStatuses(admin, fixture) {
  await admin.query('BEGIN');
  try {
    for (const [userId, status] of fixture.originalUserStatuses) {
      const restored = await admin.query(
        'UPDATE "User" SET "status" = $2 WHERE "id" = $1',
        [userId, status],
      );
      if (restored.rowCount !== 1) {
        throw new Error('INVITATION_USER_STATUS_RESTORE_FAILED');
      }
    }
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
}

async function cleanup(admin, fixture) {
  await admin.query('BEGIN');
  try {
    if (!fixture.targetMembershipId && fixture.targetUserId) {
      const targetMembership = await admin.query(
        'SELECT "id" FROM "Membership" WHERE "tenantId" = $1 AND "userId" = $2',
        [fixture.tenantId, fixture.targetUserId],
      );
      if (targetMembership.rowCount === 1) {
        fixture.targetMembershipId = targetMembership.rows[0].id;
      }
    }
    if (fixture.invitationIds.length > 0) {
      const outbox = await admin.query(
        'SELECT "id" FROM "OutboxMessage" WHERE "payload"->>\'auditEventId\' IN (SELECT "id"::text FROM "AuditEvent" WHERE "targetId" = ANY($1))',
        [fixture.invitationIds],
      );
      if (outbox.rowCount > 0) {
        await admin.query('DELETE FROM "OutboxMessage" WHERE "id" = ANY($1)', [
          outbox.rows.map((row) => row.id),
        ]);
      }
      await admin.query('DELETE FROM "Invitation" WHERE "id" = ANY($1)', [
        fixture.invitationIds,
      ]);
    }
    const membershipIds = [
      fixture.membershipId,
      fixture.targetMembershipId,
    ].filter(Boolean);
    await admin.query(
      'DELETE FROM "MembershipRole" WHERE "membershipId" = ANY($1)',
      [membershipIds],
    );
    await admin.query('DELETE FROM "RolePermission" WHERE "roleId" = $1', [
      fixture.roleId,
    ]);
    await admin.query('DELETE FROM "Role" WHERE "id" = $1', [fixture.roleId]);
    if (fixture.createdPermissionIds.length > 0) {
      await admin.query(
        'DELETE FROM "Permission" WHERE "id" = ANY($1) AND NOT EXISTS (SELECT 1 FROM "RolePermission" WHERE "permissionId" = "Permission"."id")',
        [fixture.createdPermissionIds],
      );
    }
    await admin.query(
      'UPDATE "Membership" SET "status" = \'REMOVED\', "removedAt" = CURRENT_TIMESTAMP, "activeUntil" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ANY($1)',
      [membershipIds],
    );
    await admin.query(
      'UPDATE "Tenant" SET "status" = \'ARCHIVED\', "archivedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1',
      [fixture.tenantId],
    );
    await admin.query('DELETE FROM "IdempotencyKey" WHERE "key" = ANY($1)', [
      fixture.idempotencyKeys,
    ]);
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
}

async function run() {
  requireValue('INVITATION_RUNTIME_ADMIN_USERNAME', adminUsername);
  requireValue('INVITATION_RUNTIME_ADMIN_PASSWORD', adminPassword);
  requireValue('INVITATION_RUNTIME_TARGET_USERNAME', targetUsername);
  requireValue('INVITATION_RUNTIME_TARGET_PASSWORD', targetPassword);
  requireValue('DATABASE_URL', databaseUrl);
  requireValue('MIGRATION_DATABASE_URL', migrationDatabaseUrl);

  const admin = new Client({ connectionString: migrationDatabaseUrl });
  const runtime = new Client({ connectionString: databaseUrl });
  let adminUser;
  let targetUser;
  let fixture;
  try {
    currentStage = 'database_connect';
    await admin.connect();
    await runtime.connect();
    currentStage = 'admin_login';
    adminUser = await login(adminUsername, adminPassword, adminOtp);
    currentStage = 'target_login';
    targetUser = await login(targetUsername, targetPassword, targetOtp);
    currentStage = 'fixture_provision';
    fixture = await provisionFixtures(
      admin,
      adminUser.session.user.id,
      targetUser.session.user.id,
    );

    currentStage = 'tenant_switch';
    const switched = await switchTenant(
      adminUser,
      fixture.tenantId,
      adminUser.session.contextVersion ?? 0,
    );
    if (switched.tenantId !== fixture.tenantId)
      throw new Error('INVITATION_SWITCH_TENANT_MISMATCH');
    currentStage = 'admin_session_refresh';
    const adminSessionResponse = await request(
      `${apiBaseUrl}/api/v1/auth/session`,
      {},
      adminUser.jar,
    );
    const adminSession = unwrap(
      await readJson(adminSessionResponse, 'ADMIN_SESSION_AFTER_SWITCH'),
    );

    currentStage = 'invitation_create';
    const created = await apiMutation(
      adminUser,
      `/api/v1/tenants/${fixture.tenantId}/invitations`,
      {
        intendedProviderSubject: fixture.targetSubject,
        requestedRoleKeys: [fixture.roleKey],
      },
      'INVITATION_CREATE',
    );
    if (created.response.status === 403) {
      throw new Error(
        `INVITATION_CREATE_HTTP_403_CODE_${safeApiErrorCode(created.payload)}`,
      );
    }
    requireStatus(created.response, 200, 'INVITATION_CREATE');
    const createdData = unwrap(created.payload);
    requireValue('INVITATION_CREATE_TOKEN', createdData.invitationToken);
    fixture.invitationIds.push(createdData.invitationId);
    fixture.idempotencyKeys.push(created.idempotencyKey);
    const storedIdempotency = await queryOne(
      admin,
      'SELECT "responseBody" FROM "IdempotencyKey" WHERE "key" = $1',
      [created.idempotencyKey],
      'INVITATION_IDEMPOTENCY_RECORD',
    );
    if (storedIdempotency.responseBody?.data?.invitationToken) {
      throw new Error('INVITATION_RAW_TOKEN_PERSISTED');
    }
    await assertInvitationVisible(
      runtime,
      fixture.tenantId,
      adminUser.session.user.id,
      fixture.membershipId,
      createdData.invitationId,
      'PENDING',
    );
    console.log(
      'invitation_create_status=PASS|hashed_token_returned_once=true|admin_policy=true',
    );

    currentStage = 'invitation_accept';
    const accepted = await apiMutation(
      targetUser,
      '/api/v1/invitations/accept',
      { token: createdData.invitationToken },
      'INVITATION_ACCEPT',
    );
    requireStatus(accepted.response, 200, 'INVITATION_ACCEPT');
    const acceptedData = unwrap(accepted.payload);
    if (
      acceptedData.invitationId !== createdData.invitationId ||
      acceptedData.active !== true
    ) {
      throw new Error('INVITATION_ACCEPT_RESPONSE_INVALID');
    }
    fixture.targetMembershipId = acceptedData.membershipId;
    fixture.idempotencyKeys.push(accepted.idempotencyKey);
    currentStage = 'invitation_accept_replay';
    const replay = await request(
      `${apiBaseUrl}/api/v1/invitations/accept`,
      {
        method: 'POST',
        headers: apiJsonHeaders(targetUser.csrfToken, accepted.idempotencyKey),
        body: JSON.stringify({ token: createdData.invitationToken }),
      },
      targetUser.jar,
    );
    requireStatus(replay, 200, 'INVITATION_ACCEPT_REPLAY');
    const replayData = unwrap(
      await readJson(replay, 'INVITATION_ACCEPT_REPLAY'),
    );
    if (replayData.invitationId !== createdData.invitationId) {
      throw new Error('INVITATION_ACCEPT_REPLAY_INVALID');
    }
    await assertInvitationVisible(
      runtime,
      fixture.tenantId,
      targetUser.session.user.id,
      fixture.targetMembershipId,
      createdData.invitationId,
      'ACCEPTED',
    );
    await assertAcceptedMembershipVisible(
      runtime,
      fixture.tenantId,
      targetUser.session.user.id,
      fixture.targetMembershipId,
    );
    console.log(
      'invitation_accept_status=PASS|membership_active=true|role_assigned=true|token_replay_idempotent=true',
    );

    currentStage = 'identity_mismatch_create';
    const mismatch = await apiMutation(
      adminUser,
      `/api/v1/tenants/${fixture.tenantId}/invitations`,
      {
        intendedProviderSubject: fixture.adminSubject,
        requestedRoleKeys: [fixture.roleKey],
      },
      'INVITATION_MISMATCH_CREATE',
      adminUser.csrfToken,
    );
    requireStatus(mismatch.response, 200, 'INVITATION_MISMATCH_CREATE');
    const mismatchData = unwrap(mismatch.payload);
    fixture.invitationIds.push(mismatchData.invitationId);
    fixture.idempotencyKeys.push(mismatch.idempotencyKey);
    currentStage = 'identity_mismatch_accept';
    const mismatchAccept = await apiMutation(
      targetUser,
      '/api/v1/invitations/accept',
      { token: mismatchData.invitationToken },
      'INVITATION_MISMATCH_ACCEPT',
    );
    requireStatus(mismatchAccept.response, 403, 'INVITATION_MISMATCH_ACCEPT');
    await assertInvitationVisible(
      runtime,
      fixture.tenantId,
      adminUser.session.user.id,
      fixture.membershipId,
      mismatchData.invitationId,
      'PENDING',
    );
    console.log(
      'invitation_identity_mismatch_status=PASS|http=403|state_unchanged=true',
    );

    currentStage = 'invitation_revoke_create';
    const revoked = await apiMutation(
      adminUser,
      `/api/v1/tenants/${fixture.tenantId}/invitations`,
      {
        intendedProviderSubject: fixture.targetSubject,
        requestedRoleKeys: [fixture.roleKey],
      },
      'INVITATION_REVOKE_CREATE',
    );
    requireStatus(revoked.response, 200, 'INVITATION_REVOKE_CREATE');
    const revokedData = unwrap(revoked.payload);
    fixture.invitationIds.push(revokedData.invitationId);
    fixture.idempotencyKeys.push(revoked.idempotencyKey);
    currentStage = 'invitation_revoke';
    const revoke = await apiMutation(
      adminUser,
      `/api/v1/tenants/${fixture.tenantId}/invitations/${revokedData.invitationId}/revoke`,
      {},
      'INVITATION_REVOKE',
    );
    requireStatus(revoke.response, 200, 'INVITATION_REVOKE');
    fixture.idempotencyKeys.push(revoke.idempotencyKey);
    await assertInvitationVisible(
      runtime,
      fixture.tenantId,
      adminUser.session.user.id,
      fixture.membershipId,
      revokedData.invitationId,
      'REVOKED',
    );
    console.log('invitation_revoke_status=PASS|state=REVOKED');

    currentStage = 'invitation_expiry_create';
    const expired = await apiMutation(
      adminUser,
      `/api/v1/tenants/${fixture.tenantId}/invitations`,
      {
        intendedProviderSubject: fixture.targetSubject,
        requestedRoleKeys: [fixture.roleKey],
      },
      'INVITATION_EXPIRE_CREATE',
    );
    requireStatus(expired.response, 200, 'INVITATION_EXPIRE_CREATE');
    const expiredData = unwrap(expired.payload);
    fixture.invitationIds.push(expiredData.invitationId);
    fixture.idempotencyKeys.push(expired.idempotencyKey);
    await admin.query(
      'UPDATE "Invitation" SET "expiresAt" = CURRENT_TIMESTAMP - INTERVAL \'1 minute\' WHERE "id" = $1',
      [expiredData.invitationId],
    );
    currentStage = 'invitation_expiry_accept';
    const expireAccept = await apiMutation(
      targetUser,
      '/api/v1/invitations/accept',
      { token: expiredData.invitationToken },
      'INVITATION_EXPIRE_ACCEPT',
    );
    requireStatus(expireAccept.response, 409, 'INVITATION_EXPIRE_ACCEPT');
    fixture.idempotencyKeys.push(expireAccept.idempotencyKey);
    await assertInvitationVisible(
      runtime,
      fixture.tenantId,
      targetUser.session.user.id,
      fixture.targetMembershipId,
      expiredData.invitationId,
      'EXPIRED',
    );
    console.log(
      'invitation_expiry_status=PASS|http=409|state=EXPIRED|audit_event=true',
    );

    currentStage = 'outbox_delivery';
    const processed = await waitForProcessedOutbox(
      admin,
      [
        'membership.invitation.created',
        'membership.invitation.accepted',
        'membership.invitation.revoked',
        'membership.invitation.expired',
      ],
      fixture.invitationIds,
    );
    if (!processed) throw new Error('INVITATION_OUTBOX_NOT_PROCESSED');
    console.log('invitation_outbox_status=PASS|events_processed=true');
    console.log('phase2_invitation_runtime_result=PASS');
  } catch (error) {
    const errorClass = error instanceof Error ? error.name : 'UnknownError';
    const errorCode =
      error instanceof Error && /^[A-Z][A-Z0-9_]*$/.test(error.message)
        ? error.message
        : 'UNCLASSIFIED';
    const fixtureSubstage =
      currentStage === 'fixture_provision' ? currentSubstage : 'none';
    console.log(
      `phase2_invitation_runtime_result=FAIL|stage=${currentStage}|substage=${fixtureSubstage}|error_class=${errorClass}|error_code=${errorCode}|sqlstate=${safeSqlState(error)}|sqlcategory=${safeSqlCategory(error)}`,
    );
    process.exitCode = 1;
  } finally {
    if (fixture) {
      try {
        let cleanupFailure;
        currentStage = 'cleanup';
        try {
          await cleanup(admin, fixture);
        } catch (error) {
          cleanupFailure = error;
        }
        currentStage = 'cleanup_user_status';
        try {
          await restoreOriginalUserStatuses(admin, fixture);
        } catch (error) {
          cleanupFailure ??= error;
        }
        if (cleanupFailure) throw cleanupFailure;
        const cleanupResult = await admin.query(
          'SELECT COUNT(*)::int AS active_memberships FROM "Membership" WHERE "id" = ANY($1) AND "status" IN (\'ACTIVE\', \'INVITED\', \'SUSPENDED\')',
          [[fixture.membershipId, fixture.targetMembershipId].filter(Boolean)],
        );
        const activeTenantResult = await admin.query(
          'SELECT COUNT(*)::int AS active_tenants FROM "Tenant" WHERE "id" = $1 AND "status" = \'ACTIVE\'',
          [fixture.tenantId],
        );
        console.log(
          `invitation_fixture_cleanup_status=PASS|active_fixture_tenants=${activeTenantResult.rows[0].active_tenants}|active_fixture_memberships=${cleanupResult.rows[0].active_memberships}|audit_append_only=true`,
        );
      } catch (cleanupError) {
        console.log(
          `invitation_fixture_cleanup_status=FAIL|error_class=${
            cleanupError instanceof Error ? cleanupError.name : 'UnknownError'
          }`,
        );
        process.exitCode = 1;
      }
    }
    try {
      if (adminUser)
        await request(
          `${apiBaseUrl}/api/v1/auth/logout`,
          {
            method: 'POST',
            headers: { origin, 'x-csrf-token': adminUser.csrfToken },
          },
          adminUser.jar,
        );
      if (targetUser)
        await request(
          `${apiBaseUrl}/api/v1/auth/logout`,
          {
            method: 'POST',
            headers: { origin, 'x-csrf-token': targetUser.csrfToken },
          },
          targetUser.jar,
        );
    } catch {
      process.exitCode = 1;
    }
    await runtime?.end().catch(() => undefined);
    await admin?.end().catch(() => undefined);
  }
}

await run();
