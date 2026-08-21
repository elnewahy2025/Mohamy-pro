# Keycloak Official Evidence Used for Phase 2 Authentication

**Captured:** 2026-08-22

This source note preserves the official Keycloak facts used by the Phase 2 authentication architecture decision. It is evidence for architecture only; it is not proof that Mohamy Pro has implemented or runtime-tested Keycloak integration.

## Official sources

1. [Keycloak — Running Keycloak in a container](https://www.keycloak.org/server/containers)
2. [Keycloak — Docker getting started](https://www.keycloak.org/getting-started/getting-started-docker)
3. [Keycloak — OpenID Connect layers](https://www.keycloak.org/securing-apps/oidc-layers)

## Captured facts

The official container guide documents the Keycloak container image, recommends an optimized image for startup, exposes health endpoints when enabled, and states that a custom entrypoint must use `exec` so termination signals reach Keycloak for graceful shutdown. It documents `start-dev` as a development/testing mode and explicitly says that this mode must be avoided in production; production requires an appropriate database, TLS, secure bootstrap credentials, resource limits, and operational configuration.

The official Docker getting-started guide uses the Keycloak container, creates an initial admin through bootstrap environment variables, creates a dedicated application realm rather than using the `master` realm for application users, and registers an OpenID Connect client with standard flow enabled. The development command and example credentials in that guide are for getting started only and are not acceptable production credentials or repository values.

The official OIDC guide documents the realm discovery endpoint at `/realms/{realm-name}/.well-known/openid-configuration`, authorization and token endpoints, userinfo, logout, certificates/JWKS, introspection, revocation, and authorization-code flow. It describes authorization code as redirecting the user agent to Keycloak and exchanging the returned code for tokens. It warns against implicit flow under current OAuth security practice and says resource-owner password credentials must not be used, preferring authorization code or other appropriate flows. It also notes that signed access tokens can be locally validated using the realm public key or JWKS obtained through discovery, with introspection as a network-based alternative.

These facts support the approved Mohamy Pro decision: self-hosted Keycloak for Windows development/verification; a dedicated application realm; Authorization Code + PKCE; no password grant; server-side token handling; discovery/JWKS validation; and no unqualified Windows-Docker production claim.
