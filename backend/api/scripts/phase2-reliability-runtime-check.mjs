import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { loadApiLocalEnv } from './load-api-local-env.mjs';

loadApiLocalEnv(import.meta.url);

const { Client } = pg;
const queueName = 'mohamy-application';
const apiBaseUrl =
  process.env.AUTH_RUNTIME_API_BASE_URL ?? 'http://127.0.0.1:3000';
const origin = process.env.AUTH_RUNTIME_ORIGIN ?? 'http://localhost:5173';
const username = process.env.AUTH_RUNTIME_USERNAME ?? 'phase2-runtime-user';
const password = process.env.AUTH_RUNTIME_PASSWORD ?? 'phase2-runtime-password';
const cookieName = process.env.SESSION_COOKIE_NAME ?? 'mohamy_session';
const databaseUrl = process.env.DATABASE_URL;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
const timeoutMs = 60_000;
const oneDayMs = 24 * 60 * 60 * 1_000;
const eightYearsMs = 8 * 365.25 * oneDayMs;

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
}

function splitSetCookie(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=]+=[^;,]+)/);
}

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
  throw new Error(`${label} timed out`);
}

function redisConnection(url) {
  const parsed = new URL(required('REDIS_URL', url));
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.password
      ? { password: decodeURIComponent(parsed.password) }
      : {}),
    ...(parsed.username
      ? { username: decodeURIComponent(parsed.username) }
      : {}),
  };
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
  if (!location) throw new Error(`${label} did not return a redirect location`);
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
  if (!formTag) throw new Error('Keycloak login form was not found');
  const action = htmlAttribute(formTag, 'action');
  if (!action) throw new Error('Keycloak login form action was not found');
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

async function login() {
  const jar = new CookieJar();
  let loginStage = 'login_start';
  try {
    const loginResponse = await request(
      `${apiBaseUrl}/api/v1/auth/login?returnTo=%2Far`,
      {},
      jar,
    );
    if (loginResponse.status !== 302) {
      throw new Error(`login start returned HTTP ${loginResponse.status}`);
    }
    const authorizationUrl = absoluteLocation(
      apiBaseUrl,
      loginResponse,
      'login start',
    );
    const authorization = new URL(authorizationUrl);
    if (authorization.searchParams.get('code_challenge_method') !== 'S256') {
      throw new Error('OIDC PKCE method is not S256');
    }

    loginStage = 'authorization_page';
    const keycloakLogin = await request(authorizationUrl, {}, jar);
    if (keycloakLogin.status !== 200) {
      throw new Error(
        `Keycloak login page returned HTTP ${keycloakLogin.status}`,
      );
    }
    const form = loginForm(await keycloakLogin.text(), authorizationUrl);

    loginStage = 'credential_submission';
    const credentialResponse = await request(
      form.action,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.fields,
      },
      jar,
    );
    if (credentialResponse.status !== 302) {
      throw new Error(
        `Keycloak credential submission returned HTTP ${credentialResponse.status}`,
      );
    }
    const callbackUrl = absoluteLocation(
      authorizationUrl,
      credentialResponse,
      'Keycloak credential submission',
    );

    loginStage = 'callback_request';
    const callback = await request(callbackUrl, { headers: { origin } }, jar);
    if (callback.status !== 302 || !jar.header().includes(`${cookieName}=`)) {
      throw new Error('OIDC login did not establish an application session');
    }
    return jar;
  } catch (error) {
    const wrapped = new Error('OIDC login stage failed');
    wrapped.name = 'OidcLoginStageError';
    wrapped.loginStage = loginStage;
    wrapped.causeClass = safeErrorClass(error);
    throw wrapped;
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function sessionRequest(jar) {
  const response = await request(`${apiBaseUrl}/api/v1/auth/session`, {}, jar);
  return { response, body: await readJson(response) };
}

async function csrfRequest(jar) {
  const response = await request(`${apiBaseUrl}/api/v1/auth/csrf`, {}, jar);
  return { response, body: await readJson(response) };
}

async function switchRequest(jar, tenantId, expectedVersion, key) {
  const csrf = await csrfRequest(jar);
  if (
    csrf.response.status !== 200 ||
    typeof csrf.body?.csrfToken !== 'string'
  ) {
    throw new Error('CSRF bootstrap failed');
  }
  const correlationId = randomUUID();
  const response = await request(
    `${apiBaseUrl}/api/v1/session/tenant-switch`,
    {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        'x-correlation-id': correlationId,
        'idempotency-key': key,
        'x-csrf-token': csrf.body.csrfToken,
      },
      body: JSON.stringify({
        tenantId,
        expectedContextVersion: expectedVersion,
      }),
    },
    jar,
  );
  return { response, body: await readJson(response), correlationId };
}

function baseSettings(settings = {}) {
  return {
    tenantId: settings.tenantId ?? '',
    userId: settings.userId ?? '',
    membershipId: settings.membershipId ?? '',
    operationId: settings.operationId ?? randomUUID(),
    globalOperation: settings.globalOperation ?? false,
    outboxDispatcher: settings.outboxDispatcher ?? false,
    auditRetentionPurge: settings.auditRetentionPurge ?? false,
  };
}

async function withSettings(client, settings, callback) {
  const values = baseSettings(settings);
  await client.query('BEGIN');
  try {
    await client.query(
      `SELECT
         set_config('app.tenant_id', $1, true),
         set_config('app.user_id', $2, true),
         set_config('app.membership_id', $3, true),
         set_config('app.operation_id', $4, true),
         set_config('app.global_operation', $5, true),
         set_config('app.outbox_dispatcher', $6, true),
         set_config('app.idempotency_maintenance', 'false', true),
         set_config('app.audit_retention_purge', $7, true)`,
      [
        values.tenantId,
        values.userId,
        values.membershipId,
        values.operationId,
        String(values.globalOperation),
        String(values.outboxDispatcher),
        String(values.auditRetentionPurge),
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

async function readAuditById(client, id, settings) {
  return withSettings(client, settings, async () => {
    const result = await client.query(
      `SELECT "id", "eventType", "outcome", "tenantId", "actorUserId",
              "actorMembershipId", "correlationId", "payloadHash", "retentionUntil", "legalHold"
       FROM "AuditEvent" WHERE "id" = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  });
}

async function readAuditByCorrelation(client, correlationId) {
  return withSettings(
    client,
    { operationId: randomUUID(), outboxDispatcher: true },
    async () => {
      const result = await client.query(
        `SELECT "id", "eventType", "outcome", "tenantId", "actorUserId",
                "actorMembershipId", "correlationId", "payloadHash", "retentionUntil", "legalHold"
         FROM "AuditEvent" WHERE "correlationId" = $1
         ORDER BY "createdAt" DESC`,
        [correlationId],
      );
      return result.rows;
    },
  );
}

async function readOutboxByAggregate(client, aggregateId) {
  return withSettings(
    client,
    { operationId: randomUUID(), outboxDispatcher: true },
    async () => {
      const result = await client.query(
        `SELECT "id", "tenantId", "scope", "aggregateType", "aggregateId", "eventType",
                "eventVersion", "payload", "correlationId", "contextUserId",
                "contextMembershipId", "operationId", "status", "attempts", "availableAt",
                "claimedAt", "leaseToken", "deadLetteredAt", "processedAt"
         FROM "OutboxMessage"
         WHERE "aggregateType" = 'AuditEvent' AND "aggregateId" = $1
         ORDER BY "createdAt" DESC`,
        [aggregateId],
      );
      return result.rows[0] ?? null;
    },
  );
}

function assertRestrictedRuntimeRole(state) {
  assert(
    state.row_security_enabled === true,
    'AuditEvent row-level security is not enabled',
  );
  assert(
    state.row_security_forced === true,
    'AuditEvent row-level security is not forced',
  );
  assert(
    state.is_superuser === false && state.bypasses_rls === false,
    'runtime database role bypasses row-level security',
  );
}

async function readRlsRuntimeState(client) {
  const result = await client.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM pg_roles
         WHERE rolname = current_user AND rolsuper = true
       ) AS is_superuser,
       EXISTS (
         SELECT 1 FROM pg_roles
         WHERE rolname = current_user AND rolbypassrls = true
       ) AS bypasses_rls,
       c.relrowsecurity AS row_security_enabled,
       c.relforcerowsecurity AS row_security_forced
     FROM pg_class AS c
     WHERE c.oid = 'public."AuditEvent"'::regclass`,
  );
  return result.rows[0] ?? null;
}

async function readOutboxById(client, id) {
  return withSettings(
    client,
    { operationId: randomUUID(), outboxDispatcher: true },
    async () => {
      const result = await client.query(
        `SELECT "status", "attempts", "availableAt", "claimedAt", "leaseToken",
                "deadLetteredAt", "processedAt"
         FROM "OutboxMessage" WHERE "id" = $1`,
        [id],
      );
      return result.rows[0] ?? null;
    },
  );
}

async function createTenant(client, tenantId, slug) {
  await withSettings(
    client,
    { operationId: randomUUID(), globalOperation: true },
    () =>
      client.query(
        `INSERT INTO "Tenant" ("id", "slug", "name", "status", "updatedAt")
         VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP)`,
        [tenantId, slug, 'Phase 2 reliability verification tenant'],
      ),
  );
}

async function createMembership(client, tenantId, membershipId, userId) {
  await withSettings(
    client,
    {
      tenantId,
      userId,
      membershipId,
      operationId: randomUUID(),
    },
    () =>
      client.query(
        `INSERT INTO "Membership"
           ("id", "tenantId", "userId", "status", "activeFrom", "activeUntil", "updatedAt")
         VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP - INTERVAL '1 minute',
                 CURRENT_TIMESTAMP + INTERVAL '1 hour', CURRENT_TIMESTAMP)`,
        [membershipId, tenantId, userId],
      ),
  );
}

async function setUserStatus(client, userId, status) {
  await withSettings(
    client,
    { operationId: randomUUID(), globalOperation: true },
    () =>
      client.query(`UPDATE "User" SET "status" = $2 WHERE "id" = $1`, [
        userId,
        status,
      ]),
  );
}

async function insertAuditFixture(client, fixture) {
  const payloadHash = createHash('sha256')
    .update(`phase2-reliability-audit-${fixture.id}`)
    .digest('hex');
  await withSettings(
    client,
    { operationId: randomUUID(), globalOperation: true },
    () =>
      client.query(
        `INSERT INTO "AuditEvent"
           ("id", "eventType", "eventVersion", "category", "outcome", "actorUserId",
            "correlationId", "metadata", "payloadHash", "occurredAt", "retentionUntil", "legalHold")
         VALUES ($1, 'privileged.operation.succeeded', 1, 'SECURITY', 'SUCCEEDED', $2,
                 $3, '{}'::jsonb, $4, $5, $6, $7)`,
        [
          fixture.id,
          fixture.userId,
          fixture.correlationId,
          payloadHash,
          fixture.occurredAt,
          fixture.retentionUntil,
          fixture.legalHold,
        ],
      ),
  );
}

async function readJobState(queue, jobId) {
  const job = await queue.getJob(jobId);
  return job ? await job.getState() : 'missing';
}

async function waitForJobsCompleted(queue, jobIds) {
  return waitFor(
    'duplicate outbox jobs',
    async () => Promise.all(jobIds.map((jobId) => readJobState(queue, jobId))),
    (states) =>
      states.length === jobIds.length &&
      states.every((state) => state === 'completed'),
  );
}

function safeErrorClass(error) {
  const name = error instanceof Error ? error.name : 'UnknownError';
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(name) ? name : 'UnknownError';
}

function safeErrorCode(value) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{2,64}$/.test(value)
    ? value
    : 'none';
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function rejects(operation) {
  try {
    await operation();
    return false;
  } catch {
    return true;
  }
}

async function main() {
  required('DATABASE_URL', databaseUrl);
  required('MIGRATION_DATABASE_URL', migrationDatabaseUrl);
  required('REDIS_URL', redisUrl);

  const database = new Client({ connectionString: databaseUrl });
  const fixtureDatabase = new Client({
    connectionString: migrationDatabaseUrl,
  });
  const redis = new IORedis(redisConnection(redisUrl));
  const queue = new Queue(queueName, { connection: redisConnection(redisUrl) });
  const createdTenantIds = [];
  const createdMembershipIds = [];
  const createdOutboxIds = [];
  const createdJobIds = [];
  const cleanupAuditIds = [];
  let appReady = false;
  let fixtureReady = false;
  let userId;
  let originalUserStatus;
  let userWasActivated = false;
  let workflowPassed = false;
  let workflowError;
  let cleanupFailed = false;
  let stage = 'initialization';

  try {
    stage = 'database_connectivity';
    await database.connect();
    await fixtureDatabase.connect();
    fixtureReady = true;
    await redis.ping();
    appReady = true;

    stage = 'rls_runtime_role_probe';
    const rlsRuntimeState = await readRlsRuntimeState(database);
    assert(
      rlsRuntimeState !== null,
      'AuditEvent RLS runtime state was unavailable',
    );
    console.log(
      `audit_rls_role_diagnostic=superuser=${rlsRuntimeState.is_superuser}|bypassrls=${rlsRuntimeState.bypasses_rls}|enabled=${rlsRuntimeState.row_security_enabled}|forced=${rlsRuntimeState.row_security_forced}`,
    );
    assertRestrictedRuntimeRole(rlsRuntimeState);
    console.log(
      'phase2_reliability_fixture_connection=admin_migration_url|runtime_assertions=database_url',
    );

    stage = 'authenticated_fixture';
    let authenticatedFixtureSubstage = 'login';
    let firstJar;
    try {
      firstJar = await login();
      authenticatedFixtureSubstage = 'session_request';
      const firstSession = await sessionRequest(firstJar);
      assert(
        firstSession.response.status === 200,
        'authenticated session unavailable',
      );
      userId = firstSession.body?.user?.id;
      originalUserStatus = firstSession.body?.user?.status;
    } catch (error) {
      const loginStage =
        error instanceof Error &&
        typeof error.loginStage === 'string' &&
        /^[a-z_]+$/.test(error.loginStage)
          ? error.loginStage
          : 'unknown';
      const causeClass =
        error instanceof Error &&
        typeof error.causeClass === 'string' &&
        /^[A-Za-z][A-Za-z0-9_]*$/.test(error.causeClass)
          ? error.causeClass
          : 'UnknownError';
      console.log(
        `audit_authenticated_fixture_diagnostic=substage=${authenticatedFixtureSubstage}|login_stage=${loginStage}|error_class=${safeErrorClass(error)}|cause_class=${causeClass}`,
      );
      throw error;
    }
    assert(typeof userId === 'string', 'authenticated user was not resolved');
    assert(
      originalUserStatus === 'PENDING' || originalUserStatus === 'ACTIVE',
      'runtime user is not in an allowed starting state',
    );

    if (originalUserStatus !== 'ACTIVE') {
      stage = 'activate_fixture_user';
      await setUserStatus(fixtureDatabase, userId, 'ACTIVE');
      userWasActivated = true;
    }

    const tenantOneId = randomUUID();
    const tenantTwoId = randomUUID();
    const membershipOneId = randomUUID();
    const membershipTwoId = randomUUID();
    createdTenantIds.push(tenantOneId, tenantTwoId);
    createdMembershipIds.push(membershipOneId, membershipTwoId);

    stage = 'create_tenant_one';
    await createTenant(
      fixtureDatabase,
      tenantOneId,
      `phase2-reliability-a-${randomUUID().replaceAll('-', '')}`,
    );
    stage = 'create_tenant_two';
    await createTenant(
      fixtureDatabase,
      tenantTwoId,
      `phase2-reliability-b-${randomUUID().replaceAll('-', '')}`,
    );
    stage = 'create_membership_one';
    await createMembership(
      fixtureDatabase,
      tenantOneId,
      membershipOneId,
      userId,
    );
    stage = 'create_membership_two';
    await createMembership(
      fixtureDatabase,
      tenantTwoId,
      membershipTwoId,
      userId,
    );

    stage = 'real_api_audit_mutation';
    const firstSwitch = await switchRequest(
      firstJar,
      tenantOneId,
      0,
      randomUUID(),
    );
    console.log(
      `audit_api_mutation_diagnostic=http=${firstSwitch.response.status}|success_field=${typeof firstSwitch.body?.success}|success_value=${firstSwitch.body?.success === true ? 'true' : firstSwitch.body?.success === false ? 'false' : 'absent'}|error_code=${safeErrorCode(firstSwitch.body?.error?.code)}`,
    );
    assert(
      firstSwitch.response.status === 200,
      'real API audit mutation did not succeed',
    );
    assert(
      firstSwitch.body?.success === true,
      'real API success envelope was invalid',
    );
    assert(
      firstSwitch.body.data?.tenantId === tenantOneId,
      'server-derived tenant was invalid',
    );
    assert(
      firstSwitch.body.data?.membershipId === membershipOneId,
      'server-derived membership was invalid',
    );
    assert(
      firstSwitch.body.data?.contextVersion === 1,
      'initial context version was invalid',
    );
    console.log(
      'audit_outbox_source_status=PASS|http=200|server_derived_context=true',
    );

    stage = 'audit_outbox_lookup';
    const auditEvents = await waitFor(
      'audit event persistence',
      () => readAuditByCorrelation(database, firstSwitch.correlationId),
      (rows) => rows.length === 1,
    );
    const auditEvent = auditEvents[0];
    assert(
      auditEvent.eventType === 'tenant.switch.succeeded',
      'audit event type was invalid',
    );
    assert(
      auditEvent.outcome === 'SUCCEEDED',
      'audit event outcome was invalid',
    );
    assert(
      auditEvent.tenantId === tenantOneId,
      'audit tenant scope was invalid',
    );
    assert(auditEvent.actorUserId === userId, 'audit actor scope was invalid');
    assert(
      auditEvent.actorMembershipId === membershipOneId,
      'audit membership scope was invalid',
    );
    assert(
      /^[0-9a-f]{64}$/.test(auditEvent.payloadHash),
      'audit payload hash was invalid',
    );
    const auditOutboxId = auditEvent.id;
    const auditOutbox = await waitFor(
      'audit outbox linkage',
      () => readOutboxByAggregate(database, auditOutboxId),
      (row) =>
        row?.aggregateType === 'AuditEvent' &&
        row.eventType === auditEvent.eventType,
    );
    createdOutboxIds.push(auditOutbox.id);
    assert(
      auditOutbox.tenantId === tenantOneId,
      'audit outbox tenant scope was invalid',
    );
    assert(
      auditOutbox.contextUserId === userId,
      'audit outbox user scope was invalid',
    );
    assert(
      auditOutbox.contextMembershipId === membershipOneId,
      'audit outbox membership scope was invalid',
    );
    assert(
      auditOutbox.payload?.auditEventId === auditEvent.id,
      'audit outbox reference was invalid',
    );

    stage = 'audit_outbox_delivery';
    const processedAuditOutbox = await waitFor(
      'audit outbox processing',
      () => readOutboxById(database, auditOutbox.id),
      (row) => row?.status === 'PROCESSED',
    );
    console.log(
      `audit_outbox_delivery_status=PASS|status=${processedAuditOutbox.status}|attempts=${processedAuditOutbox.attempts}`,
    );

    stage = 'audit_outbox_duplicate_delivery';
    const duplicatePayload = {
      outboxMessageId: auditOutbox.id,
      attempt: processedAuditOutbox.attempts,
      scope: auditOutbox.scope,
      eventVersion: auditOutbox.eventVersion,
      tenantId: auditOutbox.tenantId,
      contextUserId: auditOutbox.contextUserId,
      contextMembershipId: auditOutbox.contextMembershipId,
      operationId: auditOutbox.operationId,
    };
    for (const suffix of ['a', 'b']) {
      const jobId = `phase2-reliability-duplicate-${randomUUID()}-${suffix}`;
      createdJobIds.push(jobId);
      await queue.add('outbox.dispatch', duplicatePayload, { jobId });
    }
    const duplicateStates = await waitForJobsCompleted(
      queue,
      createdJobIds.slice(-2),
    );
    const duplicateAfter = await readOutboxById(database, auditOutbox.id);
    const auditAfterDuplicate = await readAuditByCorrelation(
      database,
      firstSwitch.correlationId,
    );
    assert(
      duplicateAfter?.status === 'PROCESSED',
      'duplicate delivery changed outbox status',
    );
    assert(
      duplicateAfter.attempts === processedAuditOutbox.attempts,
      'duplicate delivery changed outbox attempts',
    );
    assert(
      auditAfterDuplicate.length === 1,
      'duplicate delivery created an audit duplicate',
    );
    console.log(
      `audit_outbox_duplicate_status=PASS|job_states=${duplicateStates.join(',')}|attempts_unchanged=true|audit_count=1`,
    );

    stage = 'audit_rls_boundary';
    const tenantVisible = await readAuditById(database, auditEvent.id, {
      tenantId: tenantOneId,
      userId,
      membershipId: membershipOneId,
      operationId: randomUUID(),
    });
    const crossTenantHidden = await readAuditById(database, auditEvent.id, {
      tenantId: tenantTwoId,
      userId,
      membershipId: membershipTwoId,
      operationId: randomUUID(),
    });
    console.log(
      `audit_rls_diagnostic=same_tenant_${tenantVisible?.id === auditEvent.id ? 'visible' : 'hidden'}|cross_tenant_${crossTenantHidden === null ? 'hidden' : 'visible'}`,
    );
    assert(
      tenantVisible?.id === auditEvent.id,
      'tenant audit row was not visible in its tenant context',
    );
    assert(
      crossTenantHidden === null,
      'tenant audit row crossed the RLS boundary',
    );
    const unauthorizedAuditId = randomUUID();
    cleanupAuditIds.push(unauthorizedAuditId);
    const crossTenantWriteBlocked = await rejects(() =>
      withSettings(
        database,
        {
          tenantId: tenantTwoId,
          userId,
          membershipId: membershipTwoId,
          operationId: randomUUID(),
        },
        () =>
          database.query(
            `INSERT INTO "AuditEvent"
               ("id", "eventType", "eventVersion", "category", "outcome", "actorUserId",
                "actorMembershipId", "tenantId", "correlationId", "metadata", "payloadHash",
                "occurredAt", "retentionUntil", "legalHold")
             VALUES ($1, 'tenant.switch.succeeded', 1, 'SECURITY', 'SUCCEEDED', $2,
                     $3, $4, $5, '{}'::jsonb, $6,
                     CURRENT_TIMESTAMP - INTERVAL '8 years',
                     CURRENT_TIMESTAMP - INTERVAL '1 day', false)`,
            [
              unauthorizedAuditId,
              userId,
              membershipOneId,
              tenantOneId,
              randomUUID(),
              createHash('sha256').update(unauthorizedAuditId).digest('hex'),
            ],
          ),
      ),
    );
    console.log(
      `audit_rls_write_diagnostic=cross_tenant_write_${crossTenantWriteBlocked ? 'blocked' : 'allowed'}`,
    );
    assert(
      crossTenantWriteBlocked,
      'cross-tenant audit write unexpectedly succeeded',
    );
    console.log(
      'audit_rls_status=PASS|same_tenant_visible=true|cross_tenant_hidden=true|cross_tenant_write_blocked=true',
    );

    stage = 'audit_append_only_boundary';
    const updateBlocked = await rejects(() =>
      withSettings(
        database,
        { operationId: randomUUID(), auditRetentionPurge: true },
        () =>
          database.query(
            `UPDATE "AuditEvent" SET "reasonCode" = 'mutation_attempt'
             WHERE "id" = $1 RETURNING "id"`,
            [auditEvent.id],
          ),
      ),
    );
    const deleteBlocked = await rejects(() =>
      withSettings(
        database,
        { operationId: randomUUID(), auditRetentionPurge: true },
        () =>
          database.query(
            `DELETE FROM "AuditEvent" WHERE "id" = $1 RETURNING "id"`,
            [auditEvent.id],
          ),
      ),
    );
    const auditAfterMutation = await readAuditByCorrelation(
      database,
      firstSwitch.correlationId,
    );
    assert(updateBlocked, 'audit update unexpectedly succeeded');
    assert(deleteBlocked, 'audit delete unexpectedly succeeded');
    assert(auditAfterMutation.length === 1, 'audit row was mutated or deleted');
    console.log(
      'audit_append_only_status=PASS|update_blocked=true|delete_blocked=true',
    );

    stage = 'audit_retention_boundary';
    const expiredFixture = {
      id: randomUUID(),
      userId,
      correlationId: randomUUID(),
      occurredAt: new Date(Date.now() - eightYearsMs),
      retentionUntil: new Date(Date.now() - oneDayMs),
      legalHold: false,
    };
    const heldFixture = {
      id: randomUUID(),
      userId,
      correlationId: randomUUID(),
      occurredAt: new Date(Date.now() - eightYearsMs),
      retentionUntil: new Date(Date.now() - oneDayMs),
      legalHold: true,
    };
    await insertAuditFixture(fixtureDatabase, expiredFixture);
    await insertAuditFixture(fixtureDatabase, heldFixture);
    const purgeResult = await withSettings(
      database,
      { operationId: randomUUID(), auditRetentionPurge: true },
      () =>
        database.query(
          `DELETE FROM "AuditEvent"
           WHERE "id" = $1 AND "retentionUntil" <= CURRENT_TIMESTAMP AND "legalHold" = false
           RETURNING "id"`,
          [expiredFixture.id],
        ),
    );
    const heldDeleteResult = await withSettings(
      database,
      { operationId: randomUUID(), auditRetentionPurge: true },
      () =>
        database.query(
          `DELETE FROM "AuditEvent"
           WHERE "id" = $1 AND "retentionUntil" <= CURRENT_TIMESTAMP AND "legalHold" = false
           RETURNING "id"`,
          [heldFixture.id],
        ),
    );
    const heldAfterPurge = await readAuditById(database, heldFixture.id, {
      operationId: randomUUID(),
      auditRetentionPurge: true,
    });
    assert(purgeResult.rowCount === 1, 'expired audit row was not purgeable');
    assert(heldDeleteResult.rowCount !== 1, 'legal-hold audit row was purged');
    assert(
      heldAfterPurge?.legalHold === true,
      'legal-hold audit row was not retained',
    );
    console.log(
      'audit_retention_status=PASS|expired_purged=true|legal_hold_retained=true',
    );

    stage = 'outbox_retry_boundary';
    const retryId = randomUUID();
    createdOutboxIds.push(retryId);
    await withSettings(
      database,
      { operationId: randomUUID(), globalOperation: true },
      () =>
        database.query(
          `INSERT INTO "OutboxMessage"
             ("id", "aggregateType", "aggregateId", "eventType", "payload", "status", "attempts", "availableAt")
           VALUES ($1, 'Phase2Reliability', $1, $2, $3::jsonb, 'PENDING', 0, CURRENT_TIMESTAMP)`,
          [
            retryId,
            `phase2.reliability.retry.${randomUUID().replaceAll('-', '')}`,
            JSON.stringify({ test: 'retry' }),
          ],
        ),
    );
    const retryState = await waitFor(
      'outbox retry scheduling',
      () => readOutboxById(database, retryId),
      (row) => row?.status === 'FAILED' && row.attempts === 1,
    );
    assert(
      new Date(retryState.availableAt).getTime() > Date.now(),
      'retry was not scheduled in the future',
    );
    console.log(
      'audit_outbox_retry_status=PASS|first_attempt_failed=true|future_backoff=true',
    );

    stage = 'outbox_dead_letter_boundary';
    const deadLetterId = randomUUID();
    createdOutboxIds.push(deadLetterId);
    await withSettings(
      database,
      { operationId: randomUUID(), globalOperation: true },
      () =>
        database.query(
          `INSERT INTO "OutboxMessage"
             ("id", "aggregateType", "aggregateId", "eventType", "payload", "status", "attempts", "availableAt")
           VALUES ($1, 'Phase2Reliability', $1, $2, $3::jsonb, 'PENDING', 4, CURRENT_TIMESTAMP)`,
          [
            deadLetterId,
            `phase2.reliability.deadletter.${randomUUID().replaceAll('-', '')}`,
            JSON.stringify({ test: 'dead-letter' }),
          ],
        ),
    );
    const deadLetterState = await waitFor(
      'outbox dead letter transition',
      () => readOutboxById(database, deadLetterId),
      (row) => row?.status === 'DEAD_LETTER' && row.attempts === 5,
    );
    assert(
      deadLetterState.deadLetteredAt !== null,
      'dead-letter timestamp was not recorded',
    );
    console.log(
      'audit_outbox_dead_letter_status=PASS|attempts=5|terminal=true',
    );

    stage = 'tenant_switch_concurrency';
    const secondJar = await login();
    const concurrent = await Promise.all([
      switchRequest(secondJar, tenantOneId, 0, randomUUID()),
      switchRequest(secondJar, tenantTwoId, 0, randomUUID()),
    ]);
    const successful = concurrent.filter(
      (item) => item.response.status === 200,
    );
    const conflicts = concurrent.filter((item) => item.response.status === 409);
    assert(successful.length === 1, 'concurrency did not produce one winner');
    assert(conflicts.length === 1, 'concurrency did not produce one conflict');
    assert(
      successful[0].body?.success === true,
      'concurrency winner envelope was invalid',
    );
    assert(
      conflicts[0].body?.success === false,
      'concurrency loser envelope was invalid',
    );
    assert(
      conflicts[0].body?.error?.code === 'TENANT_SWITCH_CONFLICT',
      'concurrency loser error code was invalid',
    );
    const winningTenantId = successful[0].body.data?.tenantId;
    const winningMembershipId = successful[0].body.data?.membershipId;
    assert(
      (winningTenantId === tenantOneId &&
        winningMembershipId === membershipOneId) ||
        (winningTenantId === tenantTwoId &&
          winningMembershipId === membershipTwoId),
      'concurrency winner was not server-derived from the fixture memberships',
    );
    assert(
      successful[0].body.data?.contextVersion === 1,
      'concurrency winner version was invalid',
    );
    const concurrentSession = await sessionRequest(secondJar);
    assert(
      concurrentSession.response.status === 200,
      'concurrency session view failed',
    );
    assert(
      concurrentSession.body?.tenantContext?.tenantId === winningTenantId,
      'session winner tenant was inconsistent',
    );
    assert(
      concurrentSession.body?.tenantContext?.membershipId ===
        winningMembershipId,
      'session winner membership was inconsistent',
    );
    assert(
      concurrentSession.body?.tenantContext?.contextVersion === 1,
      'session winner version was inconsistent',
    );
    console.log(
      'tenant_switch_concurrency_status=PASS|winners=1|conflicts=1|context_consistent=true',
    );

    stage = 'cleanup_validation';
    workflowPassed = true;
  } catch (error) {
    workflowError = error;
  } finally {
    for (const jobId of createdJobIds) {
      let job;
      try {
        job = await queue.getJob(jobId);
      } catch {
        cleanupFailed = true;
        continue;
      }
      if (job) {
        try {
          await job.remove();
        } catch {
          cleanupFailed = true;
        }
      }
    }
    if (fixtureReady) {
      await withSettings(
        fixtureDatabase,
        {
          operationId: randomUUID(),
          outboxDispatcher: true,
          auditRetentionPurge: true,
        },
        async () => {
          await fixtureDatabase.query(
            `DELETE FROM "AuditEvent"
             WHERE "id" = ANY($1::text[])
               AND "retentionUntil" <= CURRENT_TIMESTAMP
               AND "legalHold" = false`,
            [cleanupAuditIds],
          );
          await fixtureDatabase.query(
            `DELETE FROM "OutboxMessage" WHERE "id" = ANY($1::text[])`,
            [createdOutboxIds],
          );
        },
      ).catch(() => {
        cleanupFailed = true;
      });
      if (userId && createdTenantIds.length > 0) {
        await withSettings(
          fixtureDatabase,
          { operationId: randomUUID(), globalOperation: true },
          async () => {
            await fixtureDatabase.query(
              `UPDATE "AppSession"
               SET "activeTenantId" = NULL, "activeMembershipId" = NULL,
                   "contextVersion" = "contextVersion" + 1
               WHERE "userId" = $1 AND "status" = 'ACTIVE'
                 AND "activeTenantId" = ANY($2::text[])`,
              [userId, createdTenantIds],
            );
            await fixtureDatabase.query(
              `UPDATE "Membership"
               SET "status" = 'REMOVED', "removedAt" = CURRENT_TIMESTAMP
               WHERE "id" = ANY($1::text[]) AND "tenantId" = ANY($2::text[])`,
              [createdMembershipIds, createdTenantIds],
            );
            await fixtureDatabase.query(
              `UPDATE "Tenant" SET "status" = 'ARCHIVED', "archivedAt" = CURRENT_TIMESTAMP
               WHERE "id" = ANY($1::text[])`,
              [createdTenantIds],
            );
            if (userWasActivated && originalUserStatus) {
              await fixtureDatabase.query(
                `UPDATE "User" SET "status" = $2 WHERE "id" = $1`,
                [userId, originalUserStatus],
              );
            }
          },
        ).catch(() => {
          cleanupFailed = true;
        });
        if (!cleanupFailed) {
          const cleanupState = await withSettings(
            fixtureDatabase,
            { operationId: randomUUID(), globalOperation: true },
            async () => {
              const audit = await fixtureDatabase.query(
                `SELECT count(*)::int AS count FROM "AuditEvent" WHERE "id" = ANY($1::text[])`,
                [cleanupAuditIds],
              );
              const outbox = await fixtureDatabase.query(
                `SELECT count(*)::int AS count FROM "OutboxMessage" WHERE "id" = ANY($1::text[])`,
                [createdOutboxIds],
              );
              const tenants = await fixtureDatabase.query(
                `SELECT count(*)::int AS count FROM "Tenant" WHERE "id" = ANY($1::text[]) AND "status" <> 'ARCHIVED'`,
                [createdTenantIds],
              );
              const memberships = await fixtureDatabase.query(
                `SELECT count(*)::int AS count FROM "Membership" WHERE "id" = ANY($1::text[]) AND "status" <> 'REMOVED'`,
                [createdMembershipIds],
              );
              const sessions = await fixtureDatabase.query(
                `SELECT count(*)::int AS count FROM "AppSession"
                 WHERE "userId" = $1 AND "activeTenantId" = ANY($2::text[])`,
                [userId, createdTenantIds],
              );
              return {
                audit: audit.rows[0]?.count ?? -1,
                outbox: outbox.rows[0]?.count ?? -1,
                tenants: tenants.rows[0]?.count ?? -1,
                memberships: memberships.rows[0]?.count ?? -1,
                sessions: sessions.rows[0]?.count ?? -1,
              };
            },
          ).catch(() => null);
          if (
            !cleanupState ||
            cleanupState.audit !== 0 ||
            cleanupState.outbox !== 0 ||
            cleanupState.tenants !== 0 ||
            cleanupState.memberships !== 0 ||
            cleanupState.sessions !== 0
          ) {
            cleanupFailed = true;
          } else {
            console.log(
              `phase2_reliability_cleanup_status=PASS|audit_residue=0|outbox_residue=0|active_fixture_tenants=0|active_fixture_memberships=0|active_fixture_contexts=0`,
            );
          }
        }
      }
    }
    await queue.close().catch(() => {
      cleanupFailed = true;
    });
    await redis.quit().catch(() => {
      cleanupFailed = true;
    });
    await database.end().catch(() => {
      cleanupFailed = true;
    });
    await fixtureDatabase.end().catch(() => {
      cleanupFailed = true;
    });
  }
  if (workflowError) {
    console.error(
      `phase2_reliability_runtime_result=FAIL|stage=${stage}|error_class=${safeErrorClass(workflowError)}`,
    );
    process.exitCode = 1;
  } else if (cleanupFailed) {
    console.error(
      'phase2_reliability_runtime_result=FAIL|stage=cleanup|error_class=CleanupError',
    );
    process.exitCode = 1;
  } else if (workflowPassed) {
    console.log('phase2_reliability_runtime_result=PASS');
  }
}

main().catch((error) => {
  console.error(
    `phase2_reliability_runtime_result=FAIL|stage=unhandled|error_class=${safeErrorClass(error)}`,
  );
  process.exitCode = 1;
});
