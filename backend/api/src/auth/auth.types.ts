import type { Request } from 'express';
import type { ApiErrorEnvelope } from '../common/http/api-envelope';

export interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
  userinfo_endpoint?: string;
  response_types_supported?: string[];
  code_challenge_methods_supported?: string[];
}

export interface OidcTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  id_token: string;
  session_state?: string;
  scope?: string;
}

export interface OidcAuthorizationTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string;
  createdAt: number;
}

export interface OidcIdentityClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nbf?: number;
  nonce: string;
  email?: string;
  email_verified?: boolean;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
  acr?: string;
  amr?: string[];
  sid?: string;
}

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  userStatus: string;
  userLocale: string;
  csrfTokenHash: string;
  issuedAt: Date;
  lastUsedAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  activeMembershipCount: number;
  activeTenantId: string | null;
  activeMembershipId: string | null;
  contextVersion: number;
}

export interface AuthenticatedRequest extends Request {
  authSession?: AuthenticatedSession;
  phase2ErrorEnvelope?: ApiErrorEnvelope;
}

export interface AuthSessionView {
  authenticated: true;
  user: {
    id: string;
    status: string;
    locale: string;
  };
  session: {
    issuedAt: string;
    lastUsedAt: string;
    idleExpiresAt: string;
    absoluteExpiresAt: string;
  };
  activeMembershipCount: number;
  tenantContext: {
    tenantId: string;
    membershipId: string;
    contextVersion: number;
  } | null;
}
