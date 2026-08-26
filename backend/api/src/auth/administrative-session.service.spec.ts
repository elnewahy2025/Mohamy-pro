import { AdministrativeSessionService } from './administrative-session.service';
import { AuthorizationDeniedError } from '../authorization/authorization.errors';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const anyDateMatcher: unknown = expect.any(Date);
const uuidMatcher: unknown = expect.stringMatching(
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
);

function createFixture(target = { id: TARGET_ID }) {
  const updateMany = jest.fn().mockResolvedValue({ count: 2 });
  const transaction = {
    user: { findUnique: jest.fn().mockResolvedValue(target) },
    appSession: { updateMany },
  };
  const prisma = {
    withGlobalOperationContext: jest.fn(
      (_operationId: string, callback: (value: never) => unknown) =>
        callback(transaction as never),
    ),
  };
  const audit = { recordInTransaction: jest.fn().mockResolvedValue({}) };
  return {
    service: new AdministrativeSessionService(prisma as never, audit as never),
    prisma,
    transaction,
    updateMany,
    audit,
  };
}

describe('AdministrativeSessionService', () => {
  it('revokes every active target session and records a global aggregate audit event', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.revokeAllForUser({
        actorUserId: ACTOR_ID,
        targetUserId: TARGET_ID,
      }),
    ).resolves.toEqual({ revokedSessionCount: 2 });

    expect(fixture.prisma.withGlobalOperationContext).toHaveBeenCalledWith(
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      expect.any(Function),
    );
    expect(fixture.transaction.user.findUnique).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      select: { id: true },
    });
    expect(fixture.updateMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID, status: 'ACTIVE' },
      data: {
        status: 'REVOKED',
        revokedAt: anyDateMatcher,
        revokedReason: 'administrative_session_revocation',
        providerRefreshTokenCiphertext: null,
        csrfTokenCiphertext: null,
      },
    });
    expect(fixture.audit.recordInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'auth.session.revoked',
        category: 'SECURITY',
        outcome: 'REVOKED',
        actorUserId: ACTOR_ID,
        targetType: 'User',
        targetId: TARGET_ID,
        policy: 'CanPerformPlatformOperation',
        reasonCode: 'administrative_session_revocation',
        correlationId: uuidMatcher,
        metadata: { revokedSessionCount: 2 },
      }),
      fixture.transaction,
    );
  });

  it('fails closed for self-targeting before opening a database transaction', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.revokeAllForUser({
        actorUserId: ACTOR_ID,
        targetUserId: ACTOR_ID,
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(fixture.prisma.withGlobalOperationContext).not.toHaveBeenCalled();
  });

  it('fails closed when the target identity does not exist', async () => {
    const fixture = createFixture(null);

    await expect(
      fixture.service.revokeAllForUser({
        actorUserId: ACTOR_ID,
        targetUserId: TARGET_ID,
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(fixture.updateMany).not.toHaveBeenCalled();
    expect(fixture.audit.recordInTransaction).not.toHaveBeenCalled();
  });

  it('returns zero while still recording an administrative decision when no target session is active', async () => {
    const fixture = createFixture();
    fixture.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      fixture.service.revokeAllForUser({
        actorUserId: ACTOR_ID,
        targetUserId: TARGET_ID,
      }),
    ).resolves.toEqual({ revokedSessionCount: 0 });

    expect(fixture.audit.recordInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { revokedSessionCount: 0 } }),
      fixture.transaction,
    );
  });
});
