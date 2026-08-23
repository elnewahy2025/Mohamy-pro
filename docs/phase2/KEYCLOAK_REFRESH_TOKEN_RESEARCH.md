# Keycloak Refresh-Token Research

## Scope

This note records the official Keycloak documentation consulted while designing a non-destructive Phase 2 provider-refresh-failure test. It does not claim that the Windows runtime test has passed.

## Findings

The official Keycloak OIDC layers guide states that the token revocation endpoint supports both refresh tokens and access tokens. It also states that revoking a refresh token revokes the user consent for the corresponding client. The same guide distinguishes browser/user-agent logout from direct application invocation and recommends standard logout or an administrative/account-console mechanism rather than relying on the legacy direct logout format.[1]

The checked-in Mohamy Pro development realm has no explicit `revokeRefreshToken` setting. Its client does not request `offline_access`, and the application stores the provider refresh token encrypted on the server. A live Admin Console action to sign out all sessions for `phase2-runtime-user` was attempted during the verifier run, but the subsequent refresh still returned HTTP 204. Therefore that action is not a reliable provider-refresh-failure induction method for this development configuration.

The safe conclusion is that the current failure test is **UNVERIFIED**, not failed. A future test may use the documented Keycloak token-revocation endpoint only if it can invoke it without exposing the application’s encrypted refresh token or adding a production bypass. Otherwise, provider-refresh failure should remain explicitly unverified and be covered by the deterministic SessionService regression tests already published.

## References

[1]: https://www.keycloak.org/securing-apps/oidc-layers "Securing applications and services with OpenID Connect - Keycloak"
[2]: https://www.keycloak.org/docs/latest/server_admin/index.html "Keycloak Server Administration Guide"
