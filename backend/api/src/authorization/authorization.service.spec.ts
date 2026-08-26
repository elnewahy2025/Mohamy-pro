import {
  AuthorizationDeniedError,
  MfaStepUpRequiredError,
} from './authorization.errors';
import { AuthorizationService } from './authorization.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBERSHIP_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-08-26T10:00:00.000Z');

function role(key: string, scope: 'GLOBAL' | 'TENANT', permissions: string[]) {
  return {
    key,
    scope,
    permissions: permissions.map((permissionKey) => ({
      permission: { key: permissionKey },
    })),
  };
}

function createFixture() {
  const tenantMembership = {
    id: MEMBERSHIP_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    status: 'ACTIVE',
    activeFrom: null,
    activeUntil: null,
    tenant: { status: 'ACTIVE' },
  };
  const selectionTransaction = {
    membership: {
      findUnique: jest.fn().mockResolvedValue(tenantMembership),
    },
    globalRoleAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const tenantTransaction = {
    membershipRole: {
      findMany: jest.fn().mockResolvedValue([
        {
          role: role('tenant_admin', 'TENANT', [
            'membership.manage',
            'tenant.read',
          ]),
        },
      ]),
    },
    accessDenial: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const prisma = {
    withMembershipSelectionContext: jest.fn(
      (_context: unknown, callback: (transaction: unknown) => unknown) =>
        callback(selectionTransaction),
    ),
    withTenantContext: jest.fn(
      (_context: unknown, callback: (transaction: unknown) => unknown) =>
        callback(tenantTransaction),
    ),
  };
  const mfa = {
    evaluate: jest.fn().mockReturnValue({ satisfied: true }),
  };
  return {
    prisma,
    mfa,
    tenantTransaction,
    service: new AuthorizationService(prisma as never, mfa as never),
  };
}

describe('AuthorizationService', () => {
  it('loads global and tenant authorization data through RLS-safe contexts', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.authorize({
        policy: 'CanManageMembership',
        subject: {
          userId: USER_ID,
          userStatus: 'ACTIVE',
          activeTenantId: TENANT_ID,
          activeMembershipId: MEMBERSHIP_ID,
          mfaVerifiedAt: new Date('2026-08-26T09:55:00.000Z'),
          mfaAcr: null,
          mfaAmr: ['mfa'],
        },
        targetTenantId: TENANT_ID,
        now,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      policy: 'CanManageMembership',
      roleKey: 'tenant_admin',
    });

    expect(fixture.prisma.withMembershipSelectionContext).toHaveBeenCalledWith(
      { userId: USER_ID, operationId: expect.any(String) },
      expect.any(Function),
    );
    expect(fixture.prisma.withTenantContext).toHaveBeenCalledWith(
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        membershipId: MEMBERSHIP_ID,
        operationId: expect.any(String),
      },
      expect.any(Function),
    );
  });

  it('returns an allowlisted current-access projection', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.getCurrentAccess({
        sessionId: '44444444-4444-4444-8444-444444444444',
        userId: USER_ID,
        userStatus: 'ACTIVE',
        userLocale: 'en',
        csrfTokenHash: 'hash',
        issuedAt: now,
        lastUsedAt: now,
        idleExpiresAt: new Date('2026-08-26T10:30:00.000Z'),
        absoluteExpiresAt: new Date('2026-08-26T22:00:00.000Z'),
        mfaVerifiedAt: null,
        mfaAcr: null,
        mfaAmr: [],
        activeMembershipCount: 1,
        activeTenantId: TENANT_ID,
        activeMembershipId: MEMBERSHIP_ID,
        contextVersion: 1,
      }),
    ).resolves.toEqual({
      tenantId: TENANT_ID,
      membershipId: MEMBERSHIP_ID,
      roles: ['tenant_admin'],
      permissions: ['membership.manage', 'tenant.read'],
    });
  });

  it('throws the controlled MFA error for a sensitive policy without assurance', async () => {
    const fixture = createFixture();
    fixture.mfa.evaluate.mockReturnValue({
      satisfied: false,
      reason: 'stale_timestamp',
    });

    await expect(
      fixture.service.assertAuthorized({
        policy: 'CanManageMembership',
        subject: {
          userId: USER_ID,
          userStatus: 'ACTIVE',
          activeTenantId: TENANT_ID,
          activeMembershipId: MEMBERSHIP_ID,
          mfaVerifiedAt: null,
          mfaAcr: null,
          mfaAmr: [],
        },
        targetTenantId: TENANT_ID,
        now,
      }),
    ).rejects.toBeInstanceOf(MfaStepUpRequiredError);
  });

  it('throws a generic controlled denial for a missing policy permission', async () => {
    const fixture = createFixture();
    fixture.tenantTransaction.membershipRole.findMany.mockResolvedValue([
      { role: role('lawyer', 'TENANT', ['case.read']) },
    ]);

    await expect(
      fixture.service.assertAuthorized({
        policy: 'CanManageMembership',
        subject: {
          userId: USER_ID,
          userStatus: 'ACTIVE',
          activeTenantId: TENANT_ID,
          activeMembershipId: MEMBERSHIP_ID,
          mfaVerifiedAt: new Date('2026-08-26T09:55:00.000Z'),
          mfaAcr: null,
          mfaAmr: ['mfa'],
        },
        targetTenantId: TENANT_ID,
        now,
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });
});
