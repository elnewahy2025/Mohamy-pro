import { CsrfOriginMiddleware } from './csrf-origin.middleware';
import type { AuthenticatedSession } from './auth.types';

const csrfToken = 'A'.repeat(43);
const session: AuthenticatedSession = {
  sessionId: 'session-id',
  userId: 'user-id',
  userStatus: 'ACTIVE',
  userLocale: 'en',
  csrfTokenHash: `hash:${csrfToken}`,
  issuedAt: new Date(),
  lastUsedAt: new Date(),
  idleExpiresAt: new Date(Date.now() + 1_000),
  absoluteExpiresAt: new Date(Date.now() + 10_000),
  mfaVerifiedAt: null,
  mfaAcr: null,
  mfaAmr: [],
  activeMembershipCount: 1,
  activeTenantId: null,
  activeMembershipId: null,
  contextVersion: 0,
};

function makeMiddleware(found: AuthenticatedSession | null = session) {
  const sessions = { findByCookie: jest.fn(() => found) } as never;
  const crypto = { hash: jest.fn((value: string) => `hash:${value}`) } as never;
  const config = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'SESSION_COOKIE_NAME') return 'mohamy_session';
      if (key === 'CORS_ORIGINS') return 'http://localhost:5173';
      if (key === 'CSRF_HEADER_NAME') return 'X-CSRF-Token';
      throw new Error(`unexpected config key ${key}`);
    }),
  } as never;
  return new CsrfOriginMiddleware(sessions, crypto, config);
}

describe('CsrfOriginMiddleware', () => {
  it('allows safe methods without requiring a session', async () => {
    const middleware = makeMiddleware(null);
    const next = jest.fn();
    await middleware.use(
      { method: 'GET', headers: {} } as never,
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects missing sessions and unapproved origins', async () => {
    const missing = makeMiddleware(null);
    const missingNext = jest.fn();
    await missing.use(
      {
        method: 'POST',
        headers: { cookie: 'mohamy_session=opaque' },
      } as never,
      {} as never,
      missingNext,
    );
    expect(missingNext).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'AUTHENTICATION_REQUIRED' }),
    );

    const wrongOrigin = makeMiddleware();
    const wrongOriginNext = jest.fn();
    await wrongOrigin.use(
      {
        method: 'POST',
        headers: {
          cookie: 'mohamy_session=opaque',
          origin: 'https://attacker.invalid',
        },
      } as never,
      {} as never,
      wrongOriginNext,
    );
    expect(wrongOriginNext).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'ORIGIN_NOT_ALLOWED' }),
    );
  });

  it('rejects an invalid CSRF token and accepts a valid mutation', async () => {
    const middleware = makeMiddleware();
    const invalidNext = jest.fn();
    await middleware.use(
      {
        method: 'POST',
        headers: {
          cookie: 'mohamy_session=opaque',
          origin: 'http://localhost:5173',
          'x-csrf-token': 'B'.repeat(43),
        },
      } as never,
      {} as never,
      invalidNext,
    );
    expect(invalidNext).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'CSRF_INVALID' }),
    );

    const next = jest.fn();
    const request = {
      method: 'POST',
      headers: {
        cookie: 'mohamy_session=opaque',
        origin: 'http://localhost:5173',
        'x-csrf-token': csrfToken,
      },
    } as never;
    await middleware.use(request, {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(request.authSession).toEqual(session);
  });
});
