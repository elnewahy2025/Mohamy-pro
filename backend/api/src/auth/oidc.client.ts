import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { ValidatedEnvironment } from '../config/env.validation';
import type { OidcClientPort } from './oidc-client.port';
import {
  type OidcDiscoveryDocument,
  type OidcIdentityClaims,
  type OidcTokenResponse,
} from './auth.types';

@Injectable()
export class OidcClient implements OidcClientPort {
  private readonly logger = new Logger(OidcClient.name);
  private discovery?: OidcDiscoveryDocument;
  private discoveryExpiresAt = 0;
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private jwksIssuer?: string;

  constructor(
    private readonly config: ConfigService<ValidatedEnvironment, true>,
  ) {}

  async getDiscovery(): Promise<OidcDiscoveryDocument> {
    const now = Date.now();
    if (this.discovery && now < this.discoveryExpiresAt) {
      return this.discovery;
    }

    const issuer = this.config.getOrThrow<string>('OIDC_ISSUER_URL');
    const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
    const document = await this.fetchJson<OidcDiscoveryDocument>(
      discoveryUrl,
      'OIDC discovery',
    );
    validateDiscovery(document, issuer);
    this.discovery = document;
    this.discoveryExpiresAt =
      now +
      this.config.getOrThrow<number>('OIDC_DISCOVERY_CACHE_SECONDS') * 1_000;
    this.jwks = undefined;
    this.jwksIssuer = undefined;
    return document;
  }

  async buildAuthorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): Promise<string> {
    const discovery = await this.getDiscovery();
    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set(
      'client_id',
      this.config.getOrThrow<string>('OIDC_CLIENT_ID'),
    );
    url.searchParams.set('response_type', 'code');
    url.searchParams.set(
      'scope',
      this.config.getOrThrow<string>('OIDC_SCOPES'),
    );
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<OidcTokenResponse> {
    const discovery = await this.getDiscovery();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.getOrThrow<string>('OIDC_CLIENT_ID'),
      code,
      redirect_uri: this.config.getOrThrow<string>('OIDC_REDIRECT_URI'),
      code_verifier: codeVerifier,
    });
    const clientSecret = this.config.get<string>('OIDC_CLIENT_SECRET');
    if (clientSecret) body.set('client_secret', clientSecret);
    const response = await this.requestJson<OidcTokenResponse>(
      discovery.token_endpoint,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      },
      'OIDC token exchange',
    );
    if (
      typeof response.access_token !== 'string' ||
      response.access_token.length === 0 ||
      typeof response.id_token !== 'string' ||
      response.id_token.length === 0 ||
      typeof response.token_type !== 'string' ||
      response.token_type.toLowerCase() !== 'bearer'
    ) {
      throw new Error('OIDC token response is invalid');
    }
    return response;
  }

  async refreshToken(refreshToken: string): Promise<OidcTokenResponse> {
    const discovery = await this.getDiscovery();
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.getOrThrow<string>('OIDC_CLIENT_ID'),
      refresh_token: refreshToken,
    });
    const clientSecret = this.config.get<string>('OIDC_CLIENT_SECRET');
    if (clientSecret) body.set('client_secret', clientSecret);
    const response = await this.requestJson<OidcTokenResponse>(
      discovery.token_endpoint,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      },
      'OIDC token refresh',
    );
    if (
      typeof response.access_token !== 'string' ||
      response.access_token.length === 0 ||
      typeof response.token_type !== 'string' ||
      response.token_type.toLowerCase() !== 'bearer'
    ) {
      throw new Error('OIDC refresh response is invalid');
    }
    return response;
  }

  async verifyIdToken(
    idToken: string,
    nonce: string,
  ): Promise<OidcIdentityClaims> {
    return this.verifyJwt(idToken, nonce);
  }

  async verifyAccessToken(accessToken: string): Promise<OidcIdentityClaims> {
    return this.verifyJwt(accessToken);
  }

  private async verifyJwt(
    token: string,
    nonce?: string,
  ): Promise<OidcIdentityClaims> {
    const discovery = await this.getDiscovery();
    const jwks = this.getJwks(discovery);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: this.config.getOrThrow<string>('OIDC_ISSUER_URL'),
      audience: this.config.getOrThrow<string>('OIDC_AUDIENCE'),
      algorithms: ['RS256'],
      clockTolerance: this.config.getOrThrow<number>('OIDC_CLOCK_SKEW_SECONDS'),
      ...(nonce ? { nonce } : {}),
    });
    if (
      typeof payload.iss !== 'string' ||
      typeof payload.sub !== 'string' ||
      payload.sub.trim().length === 0 ||
      typeof payload.exp !== 'number' ||
      typeof payload.iat !== 'number' ||
      (nonce !== undefined && typeof payload.nonce !== 'string')
    ) {
      throw new Error('OIDC token claims are incomplete');
    }
    return payload as unknown as OidcIdentityClaims;
  }

  async revokeRefreshToken(refreshToken: string): Promise<boolean> {
    try {
      const discovery = await this.getDiscovery();
      if (!discovery.revocation_endpoint) return false;
      const body = new URLSearchParams({
        client_id: this.config.getOrThrow<string>('OIDC_CLIENT_ID'),
        token: refreshToken,
        token_type_hint: 'refresh_token',
      });
      const clientSecret = this.config.get<string>('OIDC_CLIENT_SECRET');
      if (clientSecret) body.set('client_secret', clientSecret);
      const response = await this.requestJson<unknown>(
        discovery.revocation_endpoint,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
        },
        'OIDC token revocation',
        true,
      );
      return response === undefined;
    } catch (error) {
      this.logger.warn(
        `OIDC refresh-token revocation was unavailable (${safeErrorName(error)})`,
      );
      return false;
    }
  }

  async getEndSessionUrl(input: {
    idTokenHint?: string;
    state?: string;
  }): Promise<string | null> {
    const discovery = await this.getDiscovery();
    if (!discovery.end_session_endpoint) return null;
    const url = new URL(discovery.end_session_endpoint);
    url.searchParams.set(
      'post_logout_redirect_uri',
      this.config.getOrThrow<string>('OIDC_POST_LOGOUT_REDIRECT_URI'),
    );
    url.searchParams.set(
      'client_id',
      this.config.getOrThrow<string>('OIDC_CLIENT_ID'),
    );
    if (input.idTokenHint)
      url.searchParams.set('id_token_hint', input.idTokenHint);
    if (input.state) url.searchParams.set('state', input.state);
    return url.toString();
  }

  private getJwks(
    discovery: OidcDiscoveryDocument,
  ): ReturnType<typeof createRemoteJWKSet> {
    if (!this.jwks || this.jwksIssuer !== discovery.issuer) {
      this.jwks = createRemoteJWKSet(new URL(discovery.jwks_uri), {
        timeoutDuration: this.config.getOrThrow<number>('OIDC_HTTP_TIMEOUT_MS'),
        cacheMaxAge:
          this.config.getOrThrow<number>('OIDC_DISCOVERY_CACHE_SECONDS') *
          1_000,
      });
      this.jwksIssuer = discovery.issuer;
    }
    return this.jwks;
  }

  private async fetchJson<T>(url: string, operation: string): Promise<T> {
    return this.requestJson<T>(url, { method: 'GET' }, operation);
  }

  private async requestJson<T>(
    url: string,
    init: RequestInit & { body?: URLSearchParams },
    operation: string,
    allowEmpty = false,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.getOrThrow<number>('OIDC_HTTP_TIMEOUT_MS'),
    );
    try {
      const response = await fetch(url, {
        ...init,
        body: init.body?.toString() ?? init.body,
        signal: controller.signal,
      });
      if (!response.ok) {
        let providerError = 'unknown';
        let providerReason = 'unknown';
        try {
          const payload = (await response.clone().json()) as {
            error?: unknown;
            error_description?: unknown;
          };
          if (
            typeof payload.error === 'string' &&
            /^[A-Za-z0-9_.:-]{1,64}$/.test(payload.error)
          ) {
            providerError = payload.error;
          }
          providerReason = classifyProviderReason(payload.error_description);
        } catch {
          // Keep provider failures non-enumerating when the body is not JSON.
        }
        this.logger.warn(
          `${operation} rejected with HTTP ${response.status}|provider_error=${providerError}|provider_reason=${providerReason}`,
        );
        throw new Error(`${operation} failed with HTTP ${response.status}`);
      }
      if (response.status === 204) return undefined as T;
      if (allowEmpty) {
        const text = await response.text();
        if (text.length === 0) return undefined as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          return undefined as T;
        }
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`${operation} timed out`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function validateDiscovery(
  document: OidcDiscoveryDocument,
  configuredIssuer: string,
): void {
  if (document.issuer !== configuredIssuer) {
    throw new Error('OIDC discovery issuer does not match configuration');
  }
  for (const [name, value] of [
    ['authorization_endpoint', document.authorization_endpoint],
    ['token_endpoint', document.token_endpoint],
    ['jwks_uri', document.jwks_uri],
  ] as const) {
    if (!isHttpUrl(value)) throw new Error(`OIDC ${name} is invalid`);
  }
  if (
    document.response_types_supported &&
    !document.response_types_supported.includes('code')
  ) {
    throw new Error('OIDC provider does not support authorization code flow');
  }
  if (
    document.code_challenge_methods_supported &&
    !document.code_challenge_methods_supported.includes('S256')
  ) {
    throw new Error('OIDC provider does not support PKCE S256');
  }
  for (const [name, value] of [
    ['end_session_endpoint', document.end_session_endpoint],
    ['revocation_endpoint', document.revocation_endpoint],
  ] as const) {
    if (value !== undefined && !isHttpUrl(value)) {
      throw new Error(`OIDC ${name} is invalid`);
    }
  }
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function classifyProviderReason(description: unknown): string {
  if (typeof description !== 'string') return 'unknown';
  const normalized = description.toLowerCase();
  if (normalized.includes('offline') && normalized.includes('not allowed')) {
    return 'offline_token_not_allowed';
  }
  if (normalized.includes('consent') && normalized.includes('not')) {
    return 'consent_not_granted';
  }
  if (normalized.includes('pkce') || normalized.includes('code verifier')) {
    return 'pkce_verifier_rejected';
  }
  if (normalized.includes('redirect_uri')) {
    return 'redirect_uri_rejected';
  }
  if (normalized.includes('code') && normalized.includes('valid')) {
    return 'authorization_code_rejected';
  }
  if (normalized.includes('client') && normalized.includes('not')) {
    return 'client_rejected';
  }
  return 'description_present';
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
