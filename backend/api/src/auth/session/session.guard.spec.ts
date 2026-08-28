import { ExecutionContext } from '@nestjs/common';
import { SessionNotFoundError } from '../auth.errors';
import { SessionCookieService } from './session-cookie.service';
import { SessionGuard } from './session.guard';
import { SessionDetails, SessionService } from './session.service';

const details: SessionDetails = {
  sessionId: 'session-1',
  userId: 'user-1',
  provider: 'logto',
  providerSubject: 'sub-1',
  activeTenantId: null,
};

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('SessionGuard', () => {
  let guard: SessionGuard;
  let cookies: { readSession: jest.Mock };
  let sessions: { validateSession: jest.Mock };

  beforeEach(() => {
    cookies = { readSession: jest.fn() };
    sessions = { validateSession: jest.fn() };
    guard = new SessionGuard(
      cookies as unknown as SessionCookieService,
      sessions as unknown as SessionService,
    );
  });

  it('rejects a request with no session cookie', async () => {
    cookies.readSession.mockReturnValue(null);
    const request: Record<string, unknown> = {};
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(false);
    expect(sessions.validateSession).not.toHaveBeenCalled();
  });

  it('attaches session details and allows a valid token', async () => {
    cookies.readSession.mockReturnValue('token-1');
    sessions.validateSession.mockResolvedValue(details);
    const request: Record<string, unknown> = {};
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.auth).toEqual(details);
    expect(sessions.validateSession).toHaveBeenCalledWith('token-1');
  });

  it('propagates session validation failures', async () => {
    cookies.readSession.mockReturnValue('token-bad');
    sessions.validateSession.mockRejectedValue(new SessionNotFoundError());
    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(
      SessionNotFoundError,
    );
  });
});
