# Phase 2 Keycloak and OIDC Research Notes

**Research date:** 2026-08-22

These notes preserve externally verified facts used by the Phase 2 authentication implementation plan.

## Verified findings

Keycloak’s official container guide states that `start-dev` is intended for development/testing and should be strictly avoided in production because of insecure defaults. The same guide documents health endpoints, realm import with `--import-realm`, and the need for explicit memory limits. Source: [Running Keycloak in a container](https://www.keycloak.org/server/containers).

The official Docker getting-started guide documents the Keycloak image `quay.io/keycloak/keycloak:26.7.2`, the `start-dev` command for local development, realm creation, user creation, and standard-flow OpenID Connect client registration. It also directs production deployments toward a production-ready database, TLS, and stronger bootstrap credentials. Source: [Docker](https://www.keycloak.org/getting-started/getting-started-docker).

The official OIDC layers guide documents the discovery endpoint at `/realms/{realm-name}/.well-known/openid-configuration`, authorization-code, token, logout, certificate/JWKS, and revocation endpoints. It describes Authorization Code as the web-application flow and states that the implicit flow should not be used under current OAuth security best practice; it also states that resource-owner-password/direct-grant flow must not be used. Source: [Securing applications and services with OpenID Connect](https://www.keycloak.org/securing-apps/oidc-layers).

## Application consequence

The repository will use a separate Keycloak development container only for the qualified Windows verification plane. The application will use discovery, Authorization Code with PKCE S256, local JWT validation against cached JWKS, server-mediated session cookies, and server-side refresh-token handling. The Keycloak development container will not be treated as production evidence.
