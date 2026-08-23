const apiBaseUrl = process.env.AUTH_RUNTIME_API_BASE_URL ?? 'http://127.0.0.1:3000';
const origin = process.env.AUTH_RUNTIME_ORIGIN ?? 'http://localhost:5173';
const username = process.env.AUTH_RUNTIME_USERNAME ?? 'phase2-runtime-user';
const password = process.env.AUTH_RUNTIME_PASSWORD ?? 'phase2-runtime-password';
const cookieName = process.env.SESSION_COOKIE_NAME ?? 'mohamy_session';
const idleWaitMs = Number(process.env.AUTH_RUNTIME_IDLE_WAIT_MS ?? 3_000);
const absoluteWaitMs = Number(process.env.AUTH_RUNTIME_ABSOLUTE_WAIT_MS ?? 6_000);

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

function requireStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(`${label} expected HTTP ${expected}, received ${response.status}`);
  }
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
  const formTag = html.match(/<form\b[^>]*id=["']kc-form-login["'][^>]*>/i)?.[0];
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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function createAuthenticatedSession(label) {
  const jar = new CookieJar();
  const loginResponse = await request(
    `${apiBaseUrl}/api/v1/auth/login?returnTo=%2Far`,
    {},
    jar,
  );
  requireStatus(loginResponse, 302, `${label} login start`);
  const authorizationUrl = absoluteLocation(apiBaseUrl, loginResponse, `${label} login start`);
  const authorization = new URL(authorizationUrl);
  if (authorization.searchParams.get('code_challenge_method') !== 'S256') {
    throw new Error(`${label} PKCE method is not S256`);
  }
  if (!authorization.searchParams.get('state')) throw new Error(`${label} state is missing`);
  if (!authorization.searchParams.get('nonce')) throw new Error(`${label} nonce is missing`);
  const keycloakLogin = await request(authorizationUrl, {}, jar);
  requireStatus(keycloakLogin, 200, `${label} Keycloak login page`);
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
  requireStatus(credentialResponse, 302, `${label} Keycloak credential submission`);
  const callbackUrl = absoluteLocation(
    authorizationUrl,
    credentialResponse,
    `${label} credential submission`,
  );
  const callback = await request(callbackUrl, { headers: { origin } }, jar);
  requireStatus(callback, 302, `${label} OIDC callback`);
  const callbackLocation = absoluteLocation(apiBaseUrl, callback, `${label} OIDC callback`);
  if (!callbackLocation.startsWith(`${origin}/ar`)) {
    throw new Error(`${label} callback returned an unexpected frontend redirect`);
  }
  if (!jar.has(cookieName)) throw new Error(`${label} callback did not set the session cookie`);
  const session = await request(`${apiBaseUrl}/api/v1/auth/session`, {}, jar);
  requireStatus(session, 200, `${label} authenticated session`);
  return jar;
}

async function main() {
  if (!Number.isFinite(idleWaitMs) || idleWaitMs < 2_000) {
    throw new Error('Idle wait must be at least 2000 milliseconds');
  }
  if (!Number.isFinite(absoluteWaitMs) || absoluteWaitMs < 5_000) {
    throw new Error('Absolute wait must be at least 5000 milliseconds');
  }

  console.log(
    `auth_expiry_config_status=READY|idle_wait_ms=${idleWaitMs}|absolute_wait_ms=${absoluteWaitMs}`,
  );

  const idleJar = await createAuthenticatedSession('idle');
  console.log('auth_expiry_idle_setup_status=PASS|session_created=true');
  await wait(idleWaitMs);
  const idleSession = await request(`${apiBaseUrl}/api/v1/auth/session`, {}, idleJar);
  requireStatus(idleSession, 401, 'idle-expired session');
  const idleRefresh = await request(
    `${apiBaseUrl}/api/v1/auth/refresh`,
    {
      method: 'POST',
      headers: {
        origin,
        'x-csrf-token': 'A'.repeat(43),
      },
    },
    idleJar,
  );
  requireStatus(idleRefresh, 401, 'idle-expired refresh');
  console.log('auth_expiry_idle_status=PASS|session_denied=true|refresh_denied=true');

  const absoluteJar = await createAuthenticatedSession('absolute');
  console.log('auth_expiry_absolute_setup_status=PASS|session_created=true');
  await wait(absoluteWaitMs);
  const absoluteSession = await request(
    `${apiBaseUrl}/api/v1/auth/session`,
    {},
    absoluteJar,
  );
  requireStatus(absoluteSession, 401, 'absolute-expired session');
  const absoluteRefresh = await request(
    `${apiBaseUrl}/api/v1/auth/refresh`,
    {
      method: 'POST',
      headers: {
        origin,
        'x-csrf-token': 'A'.repeat(43),
      },
    },
    absoluteJar,
  );
  requireStatus(absoluteRefresh, 401, 'absolute-expired refresh');
  console.log(
    'auth_expiry_absolute_status=PASS|session_denied=true|refresh_denied=true',
  );
  console.log('auth_expiry_runtime_result=PASS');
}

main().catch((error) => {
  console.error(
    `auth_expiry_runtime_result=FAIL|error=${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
