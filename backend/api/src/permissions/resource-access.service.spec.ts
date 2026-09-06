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
      breakGlassActivation: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const audit = { write: jest.fn() };
    const service = new ResourceAccessService(audit as any);

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

  it('allows active break-glass grants and audits every bypass (G7)', async () => {
    const audit = { write: jest.fn() };
    const service = new ResourceAccessService(audit as any);
    const tx = {
      caseAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      breakGlassActivation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'bg1' }),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'u2' }),
      },
    };

    await expect(
      service.requireAssignedCase(tx as any, 't1', 'm2', 'c1'),
    ).resolves.toBeUndefined();
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'breakglass.used',
        actorMembershipId: 'm2',
        tenantId: 't1',
        targetId: 'c1',
      }),
      tx,
    );
  });

  it('denies expired or revoked grants without auditing', async () => {
    const audit = { write: jest.fn() };
    const service = new ResourceAccessService(audit as any);
    const tx = {
      caseAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      breakGlassActivation: { findFirst: jest.fn().mockResolvedValue(null) },
      membership: { findFirst: jest.fn() },
    };

    await expect(
      service.requireAssignedCase(tx as any, 't1', 'm2', 'c1'),
    ).rejects.toBeInstanceOf(ResourceAccessDeniedError);
    expect(audit.write).not.toHaveBeenCalled();
    expect(tx.membership.findFirst).not.toHaveBeenCalled();
  });
});
