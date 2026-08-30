import { isOidcProtocolRoute } from './oidc-protocol-route';

describe('isOidcProtocolRoute', () => {
  it('excludes auth login and logout routes from business idempotency', () => {
    expect(isOidcProtocolRoute('/api/v1/auth/login')).toBe(true);
    expect(isOidcProtocolRoute('/api/v1/auth/logout')).toBe(true);
  });

  it('still matches the legacy OIDC protocol markers', () => {
    expect(isOidcProtocolRoute('/api/v1/auth/login/callback')).toBe(true);
    expect(isOidcProtocolRoute('/api/v1/oidc/authorize')).toBe(true);
    expect(
      isOidcProtocolRoute('/api/v1/.well-known/openid-configuration'),
    ).toBe(true);
  });

  it('does not exclude business mutation routes', () => {
    expect(isOidcProtocolRoute('/api/v1/operations')).toBe(false);
    expect(isOidcProtocolRoute('/api/v1/cases')).toBe(false);
    expect(isOidcProtocolRoute('/api/v1/auth/me')).toBe(false);
  });
});
