import { randomUUID } from 'node:crypto';
import { loadApiLocalEnv } from './load-api-local-env.mjs';

loadApiLocalEnv(import.meta.url);

const apiBaseUrl =
  process.env.AUTH_RUNTIME_API_BASE_URL ?? 'http://127.0.0.1:3000';
const origin = process.env.AUTH_RUNTIME_ORIGIN ?? 'http://localhost:5173';
const username = process.env.AUTH_RUNTIME_USERNAME ?? 'phase2-runtime-user';
const password = process.env.AUTH_RUNTIME_PASSWORD ?? 'phase2-runtime-password';
const cookieName = process.env.SESSION_COOKIE_NAME ?? 'mohamy_session';

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
  const keycloakLogin = await request(authorizationUrl, {}, jar);
  if (keycloakLogin.status !== 200) {
    throw new Error(`Keycloak login page returned HTTP ${keycloakLogin.status}`);
  }
  const form = loginForm(await keycloakLogin.text(), authorizationUrl);
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
  const callback = await request(callbackUrl, { headers: { origin } }, jar);
  if (callback.status !== 302 || !jar.has(cookieName)) {
    throw new Error('OIDC login did not establish an application session');
  }
  return jar;
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
  if (csrf.response.status !== 200 || typeof csrf.body?.csrfToken !== 'string') {
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
      body: JSON.stringify({ tenantId, expectedContextVersion: expectedVersion }),
    },
    jar,
  );
  return { response, body: await readJson(response), correlationId };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function main() {
  let app;
  let prisma;
  let userId;
  let originalUserStatus;
  const createdTenantIds = [];
  try {
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../dist/src/app.module.js');
    const { PrismaService } = await import(
      '../dist/src/infrastructure/database/prisma.service.js'
    );
    const { AuditService } = await import(
      '../dist/src/infrastructure/audit/audit.service.js'
    );
    app = await NestFactory.createApplicationContext(AppModule, {
      bufferLogs: true,
    });
    prisma = app.get(PrismaService);
    const audit = app.get(AuditService);
    const firstJar = await login();
    const secondJar = await login();
    const firstSession = await sessionRequest(firstJar);
    const secondSession = await sessionRequest(secondJar);
    if (firstSession.response.status !== 200 || secondSession.response.status !== 200) {
      throw new Error('two authenticated sessions were not established');
    }
    userId = firstSession.body?.user?.id;
    if (typeof userId !== 'string' || secondSession.body?.user?.id !== userId) {
      throw new Error('authenticated sessions did not map to one user');
    }
    originalUserStatus = firstSession.body.user.status;
    if (originalUserStatus !== 'PENDING' && originalUserStatus !== 'ACTIVE') {
      throw new Error('runtime user is not in an allowed starting state');
    }
    if (firstSession.body.tenantContext !== null) {
      throw new Error('runtime user unexpectedly started with tenant context');
    }
    console.log(
      `auth_membership_precheck=PASS|sessions=2|original_status=${originalUserStatus}|tenant_context=false`,
    );

    const tenant = await prisma.withGlobalOperationContext(
      randomUUID(),
      (transaction) =>
        transaction.tenant.create({
          data: {
            slug: `phase2-membership-${randomUUID()}`,
            name: 'Phase 2 membership verification tenant',
            status: 'ACTIVE',
          },
        }),
    );
    const fixture = {
      tenantId: tenant.id,
      membershipId: randomUUID(),
    };
    await prisma.withTenantContext(
      {
        tenantId: fixture.tenantId,
        userId,
        membershipId: fixture.membershipId,
        operationId: randomUUID(),
      },
      (transaction) =>
        transaction.membership.create({
          data: {
            id: fixture.membershipId,
            tenantId: fixture.tenantId,
            userId,
            status: 'ACTIVE',
            activeFrom: new Date(Date.now() - 60_000),
            activeUntil: new Date(Date.now() + 60 * 60_000),
          },
        }),
    );
    createdTenantIds.push(fixture.tenantId);

    const initialSwitch = await switchRequest(
      firstJar,
      fixture.tenantId,
      0,
      randomUUID(),
    );
    if (
      initialSwitch.response.status !== 200 ||
      initialSwitch.body?.success !== true ||
      initialSwitch.body.data?.tenantId !== fixture.tenantId ||
      initialSwitch.body.data?.membershipId !== fixture.membershipId ||
      initialSwitch.body.data?.contextVersion !== 1
    ) {
      throw new Error('valid tenant switch did not return the frozen success envelope');
    }
    const afterSwitch = await sessionRequest(firstJar);
    if (
      afterSwitch.response.status !== 200 ||
      afterSwitch.body?.tenantContext?.tenantId !== fixture.tenantId ||
      afterSwitch.body?.tenantContext?.membershipId !== fixture.membershipId ||
      afterSwitch.body?.tenantContext?.contextVersion !== 1
    ) {
      throw new Error('valid tenant switch was not persisted in the session view');
    }
    console.log('auth_membership_switch_status=PASS|tenant_context=true|version=1');

    const replay = await switchRequest(
      firstJar,
      fixture.tenantId,
      1,
      initialSwitch.correlationId,
    );
    if (replay.response.status !== 400 || replay.body?.success !== false) {
      throw new Error('same idempotency key with changed request was not rejected');
    }
    console.log('auth_membership_idempotency_conflict_status=PASS|http=400');

    for (const state of ['INVITED', 'SUSPENDED', 'EXPIRED', 'REMOVED']) {
      await prisma.withTenantContext(
        {
          tenantId: fixture.tenantId,
          userId,
          membershipId: fixture.membershipId,
          operationId: randomUUID(),
        },
        (transaction) =>
          transaction.membership.update({
            where: { id: fixture.membershipId },
            data: {
              status: state,
              activeFrom:
                state === 'EXPIRED'
                  ? new Date(Date.now() - 120_000)
                  : new Date(Date.now() - 60_000),
              activeUntil:
                state === 'EXPIRED'
                  ? new Date(Date.now() - 60_000)
                  : new Date(Date.now() + 60 * 60_000),
            },
          }),
      );
      const denied = await switchRequest(
        firstJar,
        fixture.tenantId,
        1,
        randomUUID(),
      );
      if (
        denied.response.status !== 403 ||
        denied.body?.success !== false ||
        denied.body?.error?.code !== 'TENANT_CONTEXT_REQUIRED'
      ) {
        throw new Error(`${state} membership was not denied with the controlled envelope`);
      }
      const unchanged = await sessionRequest(firstJar);
      if (
        unchanged.body?.tenantContext?.tenantId !== fixture.tenantId ||
        unchanged.body?.tenantContext?.contextVersion !== 1
      ) {
        throw new Error(`${state} denial changed the existing tenant context`);
      }
      console.log(
        `auth_membership_${state.toLowerCase()}_status=PASS|http=403|context_preserved=true`,
      );
      await prisma.withTenantContext(
        {
          tenantId: fixture.tenantId,
          userId,
          membershipId: fixture.membershipId,
          operationId: randomUUID(),
        },
        (transaction) =>
          transaction.membership.update({
            where: { id: fixture.membershipId },
            data: {
              status: 'ACTIVE',
              activeUntil: new Date(Date.now() + 60 * 60_000),
            },
          }),
      );
    }

    const stale = await switchRequest(
      firstJar,
      fixture.tenantId,
      0,
      randomUUID(),
    );
    if (
      stale.response.status !== 409 ||
      stale.body?.success !== false ||
      stale.body?.error?.code !== 'TENANT_SWITCH_CONFLICT'
    ) {
      throw new Error('stale context version was not denied with HTTP 409');
    }
    console.log('auth_membership_stale_context_status=PASS|http=409|context_preserved=true');

    await prisma.withTenantContext(
      {
        tenantId: fixture.tenantId,
        userId,
        membershipId: fixture.membershipId,
        operationId: randomUUID(),
      },
      (transaction) =>
        transaction.membership.update({
          where: { id: fixture.membershipId },
          data: { status: 'REMOVED', removedAt: new Date() },
        }),
    );
    const noContextJar = await login();
    const noContext = await sessionRequest(noContextJar);
    if (
      noContext.response.status !== 200 ||
      noContext.body?.tenantContext !== null ||
      noContext.body?.activeMembershipCount !== 0
    ) {
      throw new Error('zero effective memberships did not retain session without tenant context');
    }
    console.log('auth_membership_zero_status=PASS|session_access=true|tenant_context=false');

    await prisma.withGlobalOperationContext(randomUUID(), async (transaction) => {
      await transaction.tenant.update({
        where: { id: fixture.tenantId },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });
      await transaction.appSession.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: {
          activeTenantId: null,
          activeMembershipId: null,
          contextVersion: { increment: 1 },
        },
      });
    });
    await audit.recordGlobal({
      eventType: 'tenant.switch.denied',
      category: 'SECURITY',
      outcome: 'DENIED',
      actorUserId: userId,
      targetType: 'Tenant',
      targetId: fixture.tenantId,
      policy: 'CanSwitchTenant',
      reasonCode: 'membership_not_eligible',
      correlationId: randomUUID(),
      metadata: {
        sourceTenantId: fixture.tenantId,
        targetTenantId: fixture.tenantId,
      },
    });
    console.log('auth_membership_restore_status=PASS|tenant_archived=true|context_cleared=true');
    console.log('auth_membership_runtime_result=PASS');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'membership verifier failed';
    console.error(`auth_membership_runtime_result=FAIL|error=${message.slice(0, 160)}`);
    process.exitCode = 1;
  } finally {
    if (app) await app.close();
  }
}

await main();
