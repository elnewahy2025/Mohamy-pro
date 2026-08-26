import { AuthorizationController } from './authorization.controller';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';

function createController() {
  const authorization = { getCurrentAccess: jest.fn() };
  const administrativeSessions = {
    revokeAllForUser: jest.fn().mockResolvedValue({ revokedSessionCount: 2 }),
  };
  return {
    controller: new AuthorizationController(
      authorization as never,
      administrativeSessions as never,
    ),
    authorization,
    administrativeSessions,
  };
}

describe('AuthorizationController', () => {
  it('delegates administrative session revocation to the authenticated actor context', async () => {
    const fixture = createController();
    const request = {
      authSession: { userId: ACTOR_ID },
    };

    await expect(
      fixture.controller.revokeUserSessions(TARGET_ID, request as never),
    ).resolves.toEqual({ revokedSessionCount: 2 });

    expect(
      fixture.administrativeSessions.revokeAllForUser,
    ).toHaveBeenCalledWith({
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
    });
  });

  it('does not use a client-provided actor identifier', async () => {
    const fixture = createController();
    const request = {
      body: { actorUserId: TARGET_ID },
      authSession: { userId: ACTOR_ID },
    };

    await fixture.controller.revokeUserSessions(TARGET_ID, request as never);

    expect(
      fixture.administrativeSessions.revokeAllForUser,
    ).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: ACTOR_ID }));
  });
});
