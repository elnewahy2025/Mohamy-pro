export interface OidcTokens {
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
}

export interface OidcProfile {
  subject: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  locale?: string;
  providerSessionId?: string;
}

export interface AuthUrl {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}
