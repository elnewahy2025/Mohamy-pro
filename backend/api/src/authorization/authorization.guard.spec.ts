import { AuthenticationError } from '../auth/auth.errors';
import { AuthorizationGuard } from './authorization.guard';

const decision = {
  allowed: true,
  policy: 'CanViewTenant' as const,
  permissionKey: 'tenant.read' as const,
};

function session() {
  return {
    sessionId: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    userStatus: 'ACTIVE',
    userLocale: 'en',
    csrfTokenHash: 'hash',
    issuedAt: new Date(),
    lastUsedAt: new Date(),
    idleExpiresAt: new Date(Date.now() + 1_000),
    absoluteExpiresAt: new Date(Date.now() + 10_000),
    mfaVerifiedAt: null,
    mfaAcr: null,
    mfaAmr: [],
    activeMembershipCount: 1,
    activeTenantId: '33333333-3333-4333-8333-333333333333',
    activeMembershipId: '44444444-4444-4444-8444-444444444444',
    contextVersion: 0,
  };
}

function executionContext(request: Record<string, unknown>) {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn(() => ({ getRequest: () => request })),
  } as never;
}

describe('AuthorizationGuard', () => {
  it('requires a policy and attaches the server decision', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('CanViewTenant'),
    };
    const authorization = {
      assertAuthorized: jest.fn().mockResolvedValue(decision),
    };
    const request = { authSession: session(), params: {} };
    const guard = new AuthorizationGuard(
      reflector as never,
      authorization as never,
    );

    await expect(guard.canActivate(executionContext(request))).resolves.toBe(
      true,
    );
    expect(authorization.assertAuthorized).toHaveBeenCalledWith({
      policy: 'CanViewTenant',
      subject: expect.objectContaining({ userId: request.authSession.userId }),
      targetTenantId: request.authSession.activeTenantId,
    });
    expect(request.authorizationDecision).toEqual(decision);
  });

  it('prefers a scalar tenant route parameter over the active session tenant', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('CanViewTenant'),
    };
    const authorization = {
      assertAuthorized: jest.fn().mockResolvedValue(decision),
    };
    const request = {
      authSession: session(),
      params: { tenantId: '55555555-5555-4555-8555-555555555555' },
    };
    const guard = new AuthorizationGuard(
      reflector as never,
      authorization as never,
    );

    await guard.canActivate(executionContext(request));

    expect(authorization.assertAuthorized).toHaveBeenCalledWith(
      expect.objectContaining({
        targetTenantId: request.params.tenantId,
      }),
    );
  });

  it('rejects an unauthenticated request before policy evaluation', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('CanViewTenant'),
    };
    const authorization = {
      assertAuthorized: jest.fn(),
    };
    const guard = new AuthorizationGuard(
      reflector as never,
      authorization as never,
    );

    await expect(
      guard.canActivate(executionContext({ params: {} })),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(authorization.assertAuthorized).not.toHaveBeenCalled();
  });
});
