import { ExecutionContext } from '@nestjs/common';
import { CsrfMismatchError } from '../auth.errors';
import { CsrfGuard } from './csrf.guard';
import { SessionService } from './session.service';

const CORS_ORIGINS = 'http://localhost:5173,https://app.example.com';

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    header: jest.fn((name: string) =>
      name === 'origin' ? 'http://localhost:5173' : undefined,
    ),
    auth: { sessionId: 'session-1' },
    ...overrides,
  };
}

describe('CsrfGuard', () => {
  let guard: CsrfGuard;
  let sessions: { verifyCsrf: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    sessions = { verifyCsrf: jest.fn() };
    config = { get: jest.fn().mockReturnValue(CORS_ORIGINS) };
    guard = new CsrfGuard(sessions as unknown as SessionService, config as any);
  });

  it('skips the CSRF check for safe methods', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => makeRequest({ method: 'GET' }),
      }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(sessions.verifyCsrf).not.toHaveBeenCalled();
  });

  it('rejects a state-changing request without authentication', async () => {
    const request = makeRequest({ auth: undefined });
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toThrow(CsrfMismatchError);
  });

  it('rejects an origin outside the allowed list', async () => {
    const request = makeRequest({
      header: jest.fn((name: string) =>
        name === 'origin' ? 'http://evil.example.com' : undefined,
      ),
    });
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Cross-origin request rejected',
    );
  });

  it('rejects a missing X-CSRF-Token header', async () => {
    const context = {
      switchToHttp: () => ({ getRequest: () => makeRequest() }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Missing X-CSRF-Token',
    );
  });

  it('allows a valid csrf token for an allowed origin', async () => {
    sessions.verifyCsrf.mockResolvedValue(true);
    const request = makeRequest({
      header: jest.fn((name: string) =>
        name === 'origin'
          ? 'http://localhost:5173'
          : name === 'x-csrf-token'
            ? 'csrf-candidate'
            : undefined,
      ),
    });
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(sessions.verifyCsrf).toHaveBeenCalledWith(
      'session-1',
      'csrf-candidate',
    );
  });

  it('rejects an invalid csrf token', async () => {
    sessions.verifyCsrf.mockResolvedValue(false);
    const request = makeRequest({
      header: jest.fn((name: string) =>
        name === 'origin'
          ? 'http://localhost:5173'
          : name === 'x-csrf-token'
            ? 'wrong'
            : undefined,
      ),
    });
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Invalid X-CSRF-Token',
    );
  });
});
