import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as client from 'openid-client';
import type { ValidatedEnvironment } from '../../config/env.validation';
import {
  OidcConfigurationError,
  OidcInteractionError,
  OidcProviderUnavailableError,
  OidcTokenValidationError,
} from '../auth.errors';
import type { AuthUrl, OidcProfile, OidcTokens } from '../auth.types';

type Configuration = client.Configuration;

@Injectable()
export class OidcProviderService implements OnModuleInit {
  private readonly logger = new Logger(OidcProviderService.name);
  private config?: Configuration;

  constructor(
    private readonly configService: ConfigService<ValidatedEnvironment, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    const issuer = this.configService.get<string>('OIDC_ISSUER');
    const clientId = this.configService.get<string>('OIDC_CLIENT_ID');
    const clientSecret = this.configService.get<string>('OIDC_CLIENT_SECRET');
    if (!issuer) {
      throw new OidcConfigurationError('OIDC_ISSUER is required for auth');
    }
    if (!clientId || !clientSecret) {
      throw new OidcConfigurationError(
        'OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are required for auth',
      );
    }
    try {
      this.config = await client.discovery(
        new URL(issuer),
        clientId,
        clientSecret,
      );
    } catch (error) {
      this.logger.error(
        { issuer, errorName: error instanceof Error ? error.name : 'Unknown' },
        'Unable to discover the OIDC provider configuration',
      );
      throw new OidcProviderUnavailableError(
        'Unable to discover the OIDC provider configuration',
      );
    }
  }

  private getConfiguration(): Configuration {
    if (!this.config) {
      throw new OidcConfigurationError('OIDC provider is not configured');
    }
    return this.config;
  }

  private getRedirectUri(): string {
    const redirectUri = this.configService.get<string>('OIDC_REDIRECT_URI');
    if (!redirectUri) {
      throw new OidcConfigurationError(
        'OIDC_REDIRECT_URI is required for auth',
      );
    }
    return redirectUri;
  }

  getIssuer(): string {
    return this.getConfiguration().serverMetadata().issuer.toString();
  }

  getJwksUri(): string | undefined {
    const jwks = this.getConfiguration().serverMetadata().jwks_uri;
    return jwks ? jwks.toString() : undefined;
  }

  async buildAuthorizationUrl(): Promise<AuthUrl> {
    const config = this.getConfiguration();
    const redirectUri = this.getRedirectUri();
    const scope = this.configService.get<string>('OIDC_SCOPE');
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();
    const parameters: Record<string, string> = {
      redirect_uri: redirectUri,
      scope,
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    };
    const url = client.buildAuthorizationUrl(config, parameters);
    return { url: url.href, state, nonce, codeVerifier };
  }

  async exchangeCode(
    currentUrl: URL,
    codeVerifier: string,
    state: string,
    nonce: string,
  ): Promise<{ tokens: OidcTokens; profile: OidcProfile }> {
    const config = this.getConfiguration();
    const redirectUri = this.getRedirectUri();
    try {
      const tokenResponse = await client.authorizationCodeGrant(
        config,
        currentUrl,
        {
          pkceCodeVerifier: codeVerifier,
          expectedState: state,
          expectedNonce: nonce,
        },
        { redirect_uri: redirectUri },
      );
      return {
        tokens: {
          accessToken: tokenResponse.access_token,
          idToken: tokenResponse.id_token,
          refreshToken: tokenResponse.refresh_token,
          expiresIn: tokenResponse.expires_in,
          tokenType: tokenResponse.token_type,
        },
        profile: this.deriveProfile(tokenResponse),
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown OIDC code exchange error';
      if (
        error instanceof client.AuthorizationResponseError ||
        error instanceof client.ResponseBodyError
      ) {
        throw new OidcInteractionError(message);
      }
      throw new OidcTokenValidationError(message);
    }
  }

  async refresh(refreshToken: string): Promise<OidcTokens> {
    const config = this.getConfiguration();
    try {
      const response = await client.refreshTokenGrant(config, refreshToken, {
        scope: this.configService.get<string>('OIDC_SCOPE'),
      });
      return {
        accessToken: response.access_token,
        idToken: response.id_token,
        refreshToken: response.refresh_token,
        expiresIn: response.expires_in,
        tokenType: response.token_type,
      };
    } catch (error) {
      throw new OidcInteractionError(
        error instanceof Error ? error.message : 'Unable to refresh tokens',
      );
    }
  }

  async revoke(token: string): Promise<void> {
    const config = this.getConfiguration();
    const revocationEndpoint = config.serverMetadata().revocation_endpoint;
    if (!revocationEndpoint) {
      this.logger.warn(
        'Provider does not advertise a revocation endpoint; skipping token revocation',
      );
      return;
    }
    try {
      await client.tokenRevocation(config, token, {
        token_type_hint: 'refresh_token',
      });
    } catch (error) {
      throw new OidcInteractionError(
        error instanceof Error ? error.message : 'Unable to revoke token',
      );
    }
  }

  buildLogoutUrl(
    params: {
      idTokenHint?: string;
      postLogoutRedirectUri?: string;
    } = {},
  ): string {
    const config = this.getConfiguration();
    const endSession = config.serverMetadata().end_session_endpoint;
    if (!endSession) {
      throw new OidcConfigurationError(
        'Provider does not advertise an end-session endpoint',
      );
    }
    const url = new URL(endSession);
    if (params.idTokenHint) {
      url.searchParams.set('id_token_hint', params.idTokenHint);
    }
    if (params.postLogoutRedirectUri) {
      url.searchParams.set(
        'post_logout_redirect_uri',
        params.postLogoutRedirectUri,
      );
    }
    return url.href;
  }

  private deriveProfile(response: {
    id_token?: string;
    token_type?: string;
    address?: unknown;
  }): OidcProfile {
    if (!response.id_token) {
      throw new OidcTokenValidationError(
        'No ID token returned by the provider',
      );
    }
    const claims = decodeIdTokenClaims(response.id_token);
    return {
      subject: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified,
      displayName:
        claims.name ??
        [claims.given_name, claims.family_name].filter(Boolean).join(' '),
      givenName: claims.given_name,
      familyName: claims.family_name,
      locale: claims.locale,
      providerSessionId: claims.sid,
    };
  }
}

function decodeIdTokenClaims(idToken: string): Record<string, any> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new OidcTokenValidationError('Malformed ID token');
  }
  const payload = parts[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? '';
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
  const json = Buffer.from(padded, 'base64').toString('utf8');
  try {
    return JSON.parse(json) as Record<string, any>;
  } catch {
    throw new OidcTokenValidationError('Malformed ID token payload');
  }
}
