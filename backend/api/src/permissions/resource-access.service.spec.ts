import { ResourceAccessService } from './resource-access.service';
import { ResourceAccessDeniedError } from './permission.errors';

describe('ResourceAccessService (G6 central ABAC seam)', () => {
  it('allows assigned members and denies others without enumeration', async () => {
    const tx = {
      caseAssignment: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'a1' })
          .mockResolvedValueOnce(null),
        findMany: jest.fn().mockResolvedValue([{ caseId: 'c1' }]),
      },
    };
    const service = new ResourceAccessService();

    await expect(
      service.requireAssignedCase(tx as any, 't1', 'm1', 'c1'),
    ).resolves.toBeUndefined();
    await expect(
      service.requireAssignedCase(tx as any, 't1', 'm2', 'c1'),
    ).rejects.toBeInstanceOf(ResourceAccessDeniedError);

    expect(tx.caseAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          caseId: 'c1',
          membershipId: 'm1',
          tenantId: 't1',
          revokedAt: null,
        },
      }),
    );
    expect(await service.assignedCaseIds(tx as any, 't1', 'm1')).toEqual([
      'c1',
    ]);
  });
});
