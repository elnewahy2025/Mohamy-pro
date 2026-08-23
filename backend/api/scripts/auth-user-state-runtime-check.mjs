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
  if (!authorization.searchParams.get('state'))
    throw new Error('OIDC state is missing');
  if (!authorization.searchParams.get('nonce'))
    throw new Error('OIDC nonce is missing');
  if (authorization.searchParams.get('code_challenge_method') !== 'S256') {
    throw new Error('OIDC PKCE method is not S256');
  }
  const keycloakLogin = await request(authorizationUrl, {}, jar);
  if (keycloakLogin.status !== 200) {
    throw new Error(
      `Keycloak login page returned HTTP ${keycloakLogin.status}`,
    );
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
  if (callback.status !== 302) {
    throw new Error(`OIDC callback returned HTTP ${callback.status}`);
  }
  if (!jar.has(cookieName))
    throw new Error('OIDC callback did not set the session cookie');
  return jar;
}

async function sessionRequest(jar) {
  const response = await request(`${apiBaseUrl}/api/v1/auth/session`, {}, jar);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

function requireAuthenticated(body, expectedStatus, label) {
  if (
    body?.authenticated !== true ||
    body.user?.status !== expectedStatus ||
    body.tenantContext !== null ||
    !Number.isInteger(body.activeMembershipCount) ||
    body.activeMembershipCount < 0
  ) {
    throw new Error(`${label} returned an unexpected authenticated view`);
  }
}

async function main() {
  let app;
  let prisma;
  let sessionService;
  let userId;
  let originalStatus;
  try {
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../dist/src/app.module.js');
    const { PrismaService } =
      await import('../dist/src/infrastructure/database/prisma.service.js');
    const { SessionService } =
      await import('../dist/src/auth/session.service.js');
    app = await NestFactory.createApplicationContext(AppModule, {
      bufferLogs: true,
    });
    prisma = app.get(PrismaService);
    sessionService = app.get(SessionService);

    const firstJar = await login();
    const secondJar = await login();
    const firstSession = await sessionRequest(firstJar);
    const secondSession = await sessionRequest(secondJar);
    if (
      firstSession.response.status !== 200 ||
      secondSession.response.status !== 200
    ) {
      throw new Error('two authenticated sessions were not established');
    }
    userId = firstSession.body?.user?.id;
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new Error('authenticated user identifier was not returned');
    }
    if (secondSession.body?.user?.id !== userId) {
      throw new Error('authenticated sessions mapped to different users');
    }

    const stateBefore = await prisma.withGlobalOperationContext(
      randomUUID(),
      (transaction) => transaction.user.findUnique({ where: { id: userId } }),
    );
    if (!stateBefore) throw new Error('authenticated user was not persisted');
    originalStatus = stateBefore.status;
    if (!['PENDING', 'ACTIVE'].includes(originalStatus)) {
      throw new Error('runtime user is not in an allowed starting state');
    }

    const membershipCount = firstSession.body.activeMembershipCount;
    if (!Number.isInteger(membershipCount) || membershipCount < 0) {
      throw new Error('active membership count was invalid');
    }
    if (firstSession.body.tenantContext !== null) {
      throw new Error(
        'tenant context was present without a dedicated selection flow',
      );
    }
    console.log(
      `auth_user_state_precheck=PASS|sessions=2|original_status=${originalStatus}|active_memberships=${membershipCount}`,
    );

    await sessionService.transitionUserStatus(userId, 'PENDING');
    const pendingFirst = await sessionRequest(firstJar);
    const pendingSecond = await sessionRequest(secondJar);
    if (
      pendingFirst.response.status !== 200 ||
      pendingSecond.response.status !== 200
    ) {
      throw new Error(
        'PENDING state did not preserve existing application sessions',
      );
    }
    requireAuthenticated(pendingFirst.body, 'PENDING', 'PENDING session');
    requireAuthenticated(pendingSecond.body, 'PENDING', 'PENDING session');
    console.log(
      'auth_user_state_pending_status=PASS|session_access=true|tenant_context=false',
    );

    await sessionService.transitionUserStatus(userId, 'ACTIVE');
    const activeFirst = await sessionRequest(firstJar);
    const activeSecond = await sessionRequest(secondJar);
    if (
      activeFirst.response.status !== 200 ||
      activeSecond.response.status !== 200
    ) {
      throw new Error(
        'ACTIVE state did not preserve existing application sessions',
      );
    }
    requireAuthenticated(activeFirst.body, 'ACTIVE', 'ACTIVE session');
    requireAuthenticated(activeSecond.body, 'ACTIVE', 'ACTIVE session');
    console.log(
      'auth_user_state_active_status=PASS|session_access=true|tenant_context=false',
    );

    let currentJars = [firstJar, secondJar];
    for (const status of ['SUSPENDED', 'DISABLED', 'DELETED']) {
      const transition = await sessionService.transitionUserStatus(
        userId,
        status,
      );
      if (transition.status !== status || transition.revokedSessionCount < 2) {
        throw new Error(
          `${status} transition did not revoke both active sessions`,
        );
      }
      const persisted = await prisma.withGlobalOperationContext(
        randomUUID(),
        async (transaction) => {
          const user = await transaction.user.findUnique({
            where: { id: userId },
          });
          const activeSessionCount = await transaction.appSession.count({
            where: { userId, status: 'ACTIVE' },
          });
          return { userStatus: user?.status, activeSessionCount };
        },
      );
      if (
        persisted.userStatus !== status ||
        persisted.activeSessionCount !== 0
      ) {
        throw new Error(
          `${status} transition did not persist closed session state`,
        );
      }
      const deniedFirst = await sessionRequest(currentJars[0]);
      const deniedSecond = await sessionRequest(currentJars[1]);
      if (
        deniedFirst.response.status !== 401 ||
        deniedSecond.response.status !== 401
      ) {
        throw new Error(`${status} sessions were not denied after revocation`);
      }
      console.log(
        `auth_user_state_${status.toLowerCase()}_status=PASS|sessions_revoked=true|session_denied=true|persistence=true`,
      );
      await sessionService.transitionUserStatus(userId, 'ACTIVE');
      const replacementFirstJar = await login();
      const replacementSecondJar = await login();
      const replacementFirst = await sessionRequest(replacementFirstJar);
      const replacementSecond = await sessionRequest(replacementSecondJar);
      if (
        replacementFirst.response.status !== 200 ||
        replacementSecond.response.status !== 200
      ) {
        throw new Error(
          `ACTIVE restoration after ${status} did not allow new sessions`,
        );
      }
      requireAuthenticated(
        replacementFirst.body,
        'ACTIVE',
        `${status} replacement session`,
      );
      requireAuthenticated(
        replacementSecond.body,
        'ACTIVE',
        `${status} second replacement session`,
      );
      currentJars = [replacementFirstJar, replacementSecondJar];
    }

    await sessionService.transitionUserStatus(userId, originalStatus);
    const restored = await prisma.withGlobalOperationContext(
      randomUUID(),
      (transaction) => transaction.user.findUnique({ where: { id: userId } }),
    );
    if (!restored || restored.status !== originalStatus) {
      throw new Error('runtime user status was not restored');
    }
    console.log(
      `auth_user_state_restore_status=PASS|restored=true|status=${originalStatus}`,
    );
    console.log(
      `auth_membership_context_status=PASS|active_memberships=${membershipCount}|tenant_context=false`,
    );
    console.log('auth_user_state_runtime_result=PASS');
  } finally {
    if (sessionService && userId && originalStatus) {
      try {
        await sessionService.transitionUserStatus(userId, originalStatus);
      } catch {
        // The main failure is reported below; do not expose database/provider details.
      }
    }
    if (app) await app.close();
  }
}

main().catch((error) => {
  console.error(
    'auth_user_state_runtime_result=FAIL|error=verification_failed',
  );
  process.exitCode = 1;
});
