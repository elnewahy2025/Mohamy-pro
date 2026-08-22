import { Injectable } from '@nestjs/common';
import { RedisService } from '../infrastructure/redis/redis.service';
import type { OidcAuthorizationTransaction } from './auth.types';

const KEY_PREFIX = 'mohamy:oidc:authorization:';
const TTL_SECONDS = 600;

@Injectable()
export class OidcTransactionStore {
  constructor(private readonly redis: RedisService) {}

  async save(transaction: OidcAuthorizationTransaction): Promise<void> {
    validateTransaction(transaction);
    await this.redis.set(
      `${KEY_PREFIX}${transaction.state}`,
      JSON.stringify(transaction),
      TTL_SECONDS,
    );
  }

  async consume(state: string): Promise<OidcAuthorizationTransaction | null> {
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(state)) return null;
    const raw = await this.redis.getAndDelete(`${KEY_PREFIX}${state}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as OidcAuthorizationTransaction;
      validateTransaction(parsed);
      if (parsed.state !== state) throw new Error('state mismatch');
      return parsed;
    } catch {
      return null;
    }
  }
}

function validateTransaction(transaction: OidcAuthorizationTransaction): void {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(transaction.state)) {
    throw new Error('OIDC authorization state is invalid');
  }
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(transaction.nonce)) {
    throw new Error('OIDC authorization nonce is invalid');
  }
  if (!/^[A-Za-z0-9_-]{43,256}$/.test(transaction.codeVerifier)) {
    throw new Error('OIDC PKCE verifier is invalid');
  }
  if (!/^https?:\/\//.test(transaction.redirectUri)) {
    throw new Error('OIDC redirect URI is invalid');
  }
  if (!/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)$/.test(transaction.returnTo)) {
    throw new Error('OIDC return path is invalid');
  }
  if (
    !Number.isSafeInteger(transaction.createdAt) ||
    transaction.createdAt < Date.now() - TTL_SECONDS * 1_000
  ) {
    throw new Error('OIDC authorization transaction is expired');
  }
}
