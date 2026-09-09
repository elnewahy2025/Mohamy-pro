import { TeamService } from './team.service';
import type { HierarchyOperations } from './hierarchy.operations';

const CTX = {
  sessionId: 's1',
  userId: 'u1',
  tenantId: 't1',
  actorMembershipId: 'm1',
};

function service(tx: unknown) {
  const ops = {
    authorize: jest.fn().mockResolvedValue(CTX),
    run: jest
      .fn()
      .mockImplementation(
        (_r: unknown, _c: unknown, _e: unknown, _t: unknown, op: any) => op(tx),
      ),
    read: jest.fn(),
  } as unknown as HierarchyOperations;
  return new TeamService(ops);
}

describe('TeamService department link', () => {
  it('rejects unknown departments', async () => {
    const tx = {
      department: { findFirst: jest.fn().mockResolvedValue(null) },
      team: { create: jest.fn() },
    };
    const svc = service(tx);

    const failure = await svc
      .create(
        {} as never,
        {
          slug: 'squad',
          name: 'Squad',
          departmentId: 'missing',
        } as never,
      )
      .catch((error: unknown) => error);

    expect((failure as { internalReason?: string }).internalReason).toBe(
      'NO_DEPARTMENT',
    );
    expect(tx.team.create).not.toHaveBeenCalled();
  });
});
