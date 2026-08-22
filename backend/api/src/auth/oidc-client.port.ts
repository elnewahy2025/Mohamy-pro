import type {
  OidcDiscoveryDocument,
  OidcIdentityClaims,
  OidcTokenResponse,
} from './auth.types';

export const OIDC_CLIENT = Symbol('OIDC_CLIENT');

export interface OidcClientPort {
  getDiscovery(): Promise<OidcDiscoveryDocument>;
  buildAuthorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): Promise<string>;
  exchangeCode(code: string, codeVerifier: string): Promise<OidcTokenResponse>;
  refreshToken(refreshToken: string): Promise<OidcTokenResponse>;
  verifyIdToken(idToken: string, nonce: string): Promise<OidcIdentityClaims>;
  verifyAccessToken(accessToken: string): Promise<OidcIdentityClaims>;
  revokeRefreshToken(refreshToken: string): Promise<boolean>;
  getEndSessionUrl(input: {
    idTokenHint?: string;
    state?: string;
  }): Promise<string | null>;
}
