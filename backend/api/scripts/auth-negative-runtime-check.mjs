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
    throw new Error(`${label} returned HTTP ${response.status}`);
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

function requireExpectedStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(`${label} expected HTTP ${expected}, received ${response.status}`);
  }
}

async function main() {
  const jar = new CookieJar();
  const loginResponse = await request(
    `${apiBaseUrl}/api/v1/auth/login?returnTo=%2Far`,
    {},
    jar,
  );
  requireExpectedStatus(loginResponse, 302, 'login start');
  const authorizationUrl = absoluteLocation(apiBaseUrl, loginResponse, 'login start');
  const authorization = new URL(authorizationUrl);
  const state = authorization.searchParams.get('state');
  if (!state) throw new Error('OIDC state is missing');
  if (!authorization.searchParams.get('nonce')) throw new Error('OIDC nonce is missing');
  if (authorization.searchParams.get('code_challenge_method') !== 'S256') {
    throw new Error('OIDC PKCE method is not S256');
  }
  if (!authorization.searchParams.get('code_challenge')) {
    throw new Error('OIDC PKCE challenge is missing');
  }
  console.log('auth_negative_pkce_status=PASS|method=S256|state_nonce_present=true');

  const stateMismatchUrl = new URL(`${apiBaseUrl}/api/v1/auth/callback`);
  stateMismatchUrl.searchParams.set('state', `${state}-mismatch`);
  stateMismatchUrl.searchParams.set('code', 'invalid');
  const stateMismatch = await request(
    stateMismatchUrl.toString(),
    { headers: { origin } },
    jar,
  );
  requireExpectedStatus(stateMismatch, 401, 'state mismatch callback');
  console.log('auth_negative_state_mismatch_status=PASS|http=401');

  const keycloakLogin = await request(authorizationUrl, {}, jar);
  requireExpectedStatus(keycloakLogin, 200, 'Keycloak login page');
  const html = await keycloakLogin.text();
  if (!html.includes('name="username"') || !html.includes('name="password"')) {
    throw new Error('Keycloak login page did not expose the expected credential form');
  }
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
  requireExpectedStatus(credentialResponse, 302, 'Keycloak credential submission');
  const callbackUrl = absoluteLocation(
    authorizationUrl,
    credentialResponse,
    'Keycloak credential submission',
  );
  const callback = await request(callbackUrl, { headers: { origin } }, jar);
  requireExpectedStatus(callback, 302, 'OIDC callback');
  const returnLocation = absoluteLocation(apiBaseUrl, callback, 'OIDC callback');
  if (!returnLocation.startsWith(`${origin}/ar`)) {
    throw new Error('OIDC callback returned an unexpected frontend redirect');
  }
  if (!jar.has(cookieName)) throw new Error('OIDC callback did not set the session cookie');
  console.log('auth_negative_login_status=PASS|callback_validated=true|session_cookie_set=true');

  const replay = await request(callbackUrl, { headers: { origin } }, jar);
  requireExpectedStatus(replay, 401, 'state replay callback');
  console.log('auth_negative_state_replay_status=PASS|http=401');

  const sessionResponse = await request(`${apiBaseUrl}/api/v1/auth/session`, {}, jar);
  requireExpectedStatus(sessionResponse, 200, 'authenticated session');
  const session = await sessionResponse.json();
  if (session.authenticated !== true) {
    throw new Error('Authenticated session response was incomplete');
  }
  console.log('auth_negative_session_status=PASS|authenticated=true|redacted=true');

  const csrfResponse = await request(`${apiBaseUrl}/api/v1/auth/csrf`, {}, jar);
  requireExpectedStatus(csrfResponse, 200, 'CSRF token endpoint');
  const csrf = await csrfResponse.json();
  if (!/^[A-Za-z0-9_-]{43}$/.test(csrf.csrfToken ?? '')) {
    throw new Error('CSRF token response was invalid');
  }

  const missingOrigin = await request(
    `${apiBaseUrl}/api/v1/auth/logout`,
    {
      method: 'POST',
      headers: { 'x-csrf-token': csrf.csrfToken },
    },
    jar,
  );
  requireExpectedStatus(missingOrigin, 403, 'missing-origin logout');
  console.log('auth_negative_origin_missing_status=PASS|http=403');

  const disallowedOrigin = await request(
    `${apiBaseUrl}/api/v1/auth/logout`,
    {
      method: 'POST',
      headers: {
        origin: 'http://not-allowed.invalid',
        'x-csrf-token': csrf.csrfToken,
      },
    },
    jar,
  );
  requireExpectedStatus(disallowedOrigin, 403, 'disallowed-origin logout');
  console.log('auth_negative_origin_disallowed_status=PASS|http=403');

  const missingCsrf = await request(
    `${apiBaseUrl}/api/v1/auth/logout`,
    {
      method: 'POST',
      headers: { origin },
    },
    jar,
  );
  requireExpectedStatus(missingCsrf, 403, 'missing-CSRF logout');
  console.log('auth_negative_csrf_missing_status=PASS|http=403');

  const mismatchedCsrf = await request(
    `${apiBaseUrl}/api/v1/auth/logout`,
    {
      method: 'POST',
      headers: {
        origin,
        'x-csrf-token': 'A'.repeat(43),
      },
    },
    jar,
  );
  requireExpectedStatus(mismatchedCsrf, 403, 'mismatched-CSRF logout');
  console.log('auth_negative_csrf_mismatch_status=PASS|http=403');

  const preservedSession = await request(`${apiBaseUrl}/api/v1/auth/session`, {}, jar);
  requireExpectedStatus(preservedSession, 200, 'session after rejected mutations');
  console.log('auth_negative_session_preserved_status=PASS|authenticated=true');

  const refresh = await request(
    `${apiBaseUrl}/api/v1/auth/refresh`,
    {
      method: 'POST',
      headers: {
        origin,
        'x-csrf-token': csrf.csrfToken,
      },
    },
    jar,
  );
  requireExpectedStatus(refresh, 204, 'valid session refresh');
  if (!jar.has(cookieName)) throw new Error('Session cookie was lost during refresh');
  const refreshedSession = await request(
    `${apiBaseUrl}/api/v1/auth/session`,
    {},
    jar,
  );
  requireExpectedStatus(refreshedSession, 200, 'session after refresh');
  console.log('auth_lifecycle_refresh_status=PASS|http=204|session_preserved=true');

  const repeatedRefresh = await request(
    `${apiBaseUrl}/api/v1/auth/refresh`,
    {
      method: 'POST',
      headers: {
        origin,
        'x-csrf-token': csrf.csrfToken,
      },
    },
    jar,
  );
  requireExpectedStatus(repeatedRefresh, 204, 'repeated session refresh');
  if (!jar.has(cookieName)) {
    throw new Error('Session cookie was lost during repeated refresh');
  }
  console.log(
    'auth_lifecycle_refresh_repeat_status=PASS|http=204|session_preserved=true',
  );

  const logout = await request(
    `${apiBaseUrl}/api/v1/auth/logout`,
    {
      method: 'POST',
      headers: {
        origin,
        'x-csrf-token': csrf.csrfToken,
      },
    },
    jar,
  );
  requireExpectedStatus(logout, 204, 'valid logout');
  const postLogout = await request(`${apiBaseUrl}/api/v1/auth/session`, {}, jar);
  requireExpectedStatus(postLogout, 401, 'post-logout session');
  console.log('auth_negative_logout_status=PASS|http=204|post_logout_denied=true');

  const anonymous = await request(`${apiBaseUrl}/api/v1/auth/session`);
  requireExpectedStatus(anonymous, 401, 'anonymous session');
  console.log('auth_negative_anonymous_status=PASS|http=401');
  console.log('auth_negative_runtime_result=PASS');
}

main().catch((error) => {
  console.error(`auth_negative_runtime_result=FAIL|error=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
