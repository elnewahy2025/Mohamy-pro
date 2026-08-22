import { OidcTransactionStore } from './oidc-transaction.store';
import type { OidcAuthorizationTransaction } from './auth.types';

function transaction(): OidcAuthorizationTransaction {
  return {
    state: 'A'.repeat(43),
    nonce: 'B'.repeat(43),
    codeVerifier: 'C'.repeat(64),
    redirectUri: 'http://localhost:3000/api/auth/callback',
    returnTo: '/ar',
    createdAt: Date.now(),
  };
}

describe('OidcTransactionStore', () => {
  it('saves and atomically consumes a transaction only once', async () => {
    let value: string | null = null;
    const redis = {
      set: jest.fn((_key: string, next: string) => {
        value = next;
        return 'OK' as const;
      }),
      getAndDelete: jest.fn(() => {
        const current = value;
        value = null;
        return current;
      }),
    } as never;
    const store = new OidcTransactionStore(redis);
    const input = transaction();

    await store.save(input);
    expect(await store.consume(input.state)).toEqual(input);
    expect(await store.consume(input.state)).toBeNull();
    expect(redis.set).toHaveBeenCalledWith(
      `mohamy:oidc:authorization:${input.state}`,
      JSON.stringify(input),
      600,
    );
  });

  it('rejects malformed state and expired transactions', async () => {
    const redis = {
      getAndDelete: jest.fn(() =>
        JSON.stringify({ ...transaction(), createdAt: Date.now() - 601_000 }),
      ),
    } as never;
    const store = new OidcTransactionStore(redis);

    expect(await store.consume('short')).toBeNull();
    expect(await store.consume('A'.repeat(43))).toBeNull();
  });
});
