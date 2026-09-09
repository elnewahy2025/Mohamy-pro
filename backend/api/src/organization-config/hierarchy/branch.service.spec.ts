import { BranchService } from './branch.service';
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
  return new BranchService(ops);
}

describe('BranchService head office', () => {
  it('clears other head offices when one is set', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'o1' }) },
      branch: {
        create: jest.fn().mockResolvedValue({ id: 'b1', isHeadOffice: true }),
        updateMany,
      },
    };
    const svc = service(tx);

    await svc.create(
      {} as never,
      {
        organizationId: 'o1',
        slug: 'hq',
        name: 'HQ',
        isHeadOffice: true,
      } as never,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1', id: { not: 'b1' }, isHeadOffice: true },
        data: { isHeadOffice: false },
      }),
    );
  });

  it('leaves others alone when head office is not set', async () => {
    const updateMany = jest.fn();
    const tx = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'o1' }) },
      branch: {
        create: jest.fn().mockResolvedValue({ id: 'b2', isHeadOffice: false }),
        updateMany,
      },
    };
    const svc = service(tx);

    await svc.create(
      {} as never,
      {
        organizationId: 'o1',
        slug: 'branch',
        name: 'Branch',
      } as never,
    );

    expect(updateMany).not.toHaveBeenCalled();
  });
});
