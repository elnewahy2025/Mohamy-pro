const apiBaseUrl = process.env.AUTH_RUNTIME_API_BASE_URL ?? 'http://127.0.0.1:3000';
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

async function waitForManualProviderInvalidation() {
  console.log(
    'auth_provider_refresh_failure_setup_status=READY|manual_keycloak_invalidation_required=true',
  );
  console.log(
    'In Keycloak Admin Console, sign out all sessions for phase2-runtime-user, then press Enter here.',
  );
  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', resolve);
  });
}

async function main() {
  const jar = new CookieJar();
  const loginResponse = await request(
    `${apiBaseUrl}/api/v1/auth/login?returnTo=%2Far`,
    {},
    jar,
  );
  requireStatus(loginResponse, 302, 'login start');
  const authorizationUrl = absoluteLocation(apiBaseUrl, loginResponse, 'login start');
  const authorization = new URL(authorizationUrl);
  if (authorization.searchParams.get('code_challenge_method') !== 'S256') {
    throw new Error('OIDC PKCE method is not S256');
  }
  if (!authorization.searchParams.get('state')) throw new Error('OIDC state is missing');
  if (!authorization.searchParams.get('nonce')) throw new Error('OIDC nonce is missing');
  console.log('auth_provider_failure_pkce_status=PASS|method=S256|state_nonce_present=true');

  const keycloakLogin = await request(authorizationUrl, {}, jar);
  requireStatus(keycloakLogin, 200, 'Keycloak login page');
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
  requireStatus(credentialResponse, 302, 'Keycloak credential submission');
  const callbackUrl = absoluteLocation(
    authorizationUrl,
    credentialResponse,
    'Keycloak credential submission',
  );
  const callback = await request(callbackUrl, { headers: { origin } }, jar);
  requireStatus(callback, 302, 'OIDC callback');
  const callbackLocation = absoluteLocation(apiBaseUrl, callback, 'OIDC callback');
  if (!callbackLocation.startsWith(`${origin}/ar`)) {
    throw new Error('OIDC callback returned an unexpected frontend redirect');
  }
  if (!jar.has(cookieName)) throw new Error('OIDC callback did not set the session cookie');
  console.log('auth_provider_failure_login_status=PASS|callback_validated=true|session_cookie_set=true');

  const session = await request(`${apiBaseUrl}/api/v1/auth/session`, {}, jar);
  requireStatus(session, 200, 'authenticated session before invalidation');
  console.log('auth_provider_failure_session_status=PASS|authenticated=true|redacted=true');

  const csrf = await request(`${apiBaseUrl}/api/v1/auth/csrf`, {}, jar);
  requireStatus(csrf, 200, 'CSRF token before invalidation');
  const csrfPayload = await csrf.json();
  if (!/^[A-Za-z0-9_-]{43}$/.test(csrfPayload.csrfToken ?? '')) {
    throw new Error('CSRF token response was invalid');
  }

  await waitForManualProviderInvalidation();

  const refresh = await request(
    `${apiBaseUrl}/api/v1/auth/refresh`,
    {
      method: 'POST',
      headers: {
        origin,
        'x-csrf-token': csrfPayload.csrfToken,
      },
    },
    jar,
  );
  requireStatus(refresh, 401, 'provider-failed refresh');
  if (jar.has(cookieName)) {
    throw new Error('Provider-failed refresh did not clear the session cookie');
  }
  const revokedSession = await request(`${apiBaseUrl}/api/v1/auth/session`, {}, jar);
  requireStatus(revokedSession, 401, 'session after provider refresh failure');
  console.log(
    'auth_provider_refresh_failure_status=PASS|http=401|cookie_cleared=true|session_revoked=true',
  );
  console.log('auth_provider_failure_runtime_result=PASS');
}

main().catch((error) => {
  console.error(
    `auth_provider_failure_runtime_result=FAIL|error=${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
