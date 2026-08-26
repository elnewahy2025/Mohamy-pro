import {
  InvitationAcceptanceController,
  TenantInvitationController,
} from './invitation.controller';
import type { AuthenticatedRequest } from './auth.types';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const MEMBERSHIP_ID = '33333333-3333-4333-8333-333333333333';
const INVITATION_ID = '44444444-4444-4444-8444-444444444444';
const CORRELATION_ID = '55555555-5555-4555-8555-555555555555';

function request(session: Record<string, unknown>): AuthenticatedRequest {
  return {
    authSession: session,
    params: { tenantId: TENANT_ID },
    header: () => CORRELATION_ID,
    ip: '127.0.0.1',
  } as unknown as AuthenticatedRequest;
}

describe('TenantInvitationController', () => {
  it('uses the authenticated actor and server tenant route for creation', async () => {
    const invitations = { create: jest.fn().mockResolvedValue({ ok: true }) };
    const controller = new TenantInvitationController(invitations as never);
    const session = {
      userId: USER_ID,
      activeTenantId: TENANT_ID,
      activeMembershipId: MEMBERSHIP_ID,
    };

    await expect(
      controller.create(TENANT_ID, request(session), {
        intendedEmail: 'target@example.invalid',
        requestedRoleKeys: ['lawyer'],
      }),
    ).resolves.toEqual({ ok: true });

    expect(invitations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: USER_ID,
        actorMembershipId: MEMBERSHIP_ID,
        tenantId: TENANT_ID,
        correlationId: CORRELATION_ID,
      }),
    );
  });

  it('uses the authenticated actor for revocation and ignores any body actor field', async () => {
    const invitations = { revoke: jest.fn().mockResolvedValue({ ok: true }) };
    const controller = new TenantInvitationController(invitations as never);
    const session = {
      userId: USER_ID,
      activeTenantId: TENANT_ID,
      activeMembershipId: MEMBERSHIP_ID,
    };

    await expect(
      controller.revoke(TENANT_ID, INVITATION_ID, request(session)),
    ).resolves.toEqual({ ok: true });

    expect(invitations.revoke).toHaveBeenCalledWith({
      actorUserId: USER_ID,
      actorMembershipId: MEMBERSHIP_ID,
      tenantId: TENANT_ID,
      invitationId: INVITATION_ID,
      correlationId: CORRELATION_ID,
    });
  });
});

describe('InvitationAcceptanceController', () => {
  it('passes the trusted session identity and request source to acceptance', async () => {
    const invitations = {
      accept: jest.fn().mockResolvedValue({ active: true }),
    };
    const controller = new InvitationAcceptanceController(invitations as never);
    const session = {
      userId: USER_ID,
      providerSubject: 'provider-subject',
      emailNormalized: 'target@example.invalid',
    };

    await expect(
      controller.accept(request(session), { token: 'a'.repeat(43) }),
    ).resolves.toEqual({ active: true });

    expect(invitations.accept).toHaveBeenCalledWith({
      session,
      token: 'a'.repeat(43),
      correlationId: CORRELATION_ID,
      sourceIp: '127.0.0.1',
    });
  });
});
