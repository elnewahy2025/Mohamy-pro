import { DenialService } from './denial.service';
import { DenialInvalidStateError, DenialNotFoundError } from './denial.errors';

describe('DenialService', () => {
  it('rejects unknown permission keys', async () => {
    const tx = {
      membership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm1', status: 'ACTIVE' }),
      },
      accessDenial: { create: jest.fn() },
    };
    const service = new DenialService();

    await expect(
      service.createDenial(tx as any, 't1', 'mgr1', {
        permissionKey: 'CanDoAnything',
        reason: 'test',
      } as any),
    ).rejects.toBeInstanceOf(DenialInvalidStateError);
    expect(tx.accessDenial.create).not.toHaveBeenCalled();
  });

  it('rejects subjects without an active membership', async () => {
    const tx = {
      membership: { findFirst: jest.fn().mockResolvedValue(null) },
      accessDenial: { create: jest.fn() },
    };
    const service = new DenialService();

    await expect(
      service.createDenial(tx as any, 't1', 'mgr1', {
        subjectUserId: 'ghost',
        permissionKey: 'CanManageCases',
        reason: 'test',
      } as any),
    ).rejects.toBeInstanceOf(DenialNotFoundError);
  });

  it('creates tenant-scoped denials attributed to the creator', async () => {
    const tx = {
      membership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm2', status: 'ACTIVE' }),
      },
      accessDenial: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'd1',
          ...data,
        })),
      },
    };
    const service = new DenialService();

    const created: any = await service.createDenial(tx as any, 't1', 'mgr1', {
      subjectUserId: 'u2',
      permissionKey: 'CanManageCases',
      reason: 'suspension review',
    } as any);

    expect(created.tenantId).toBe('t1');
    expect(created.createdByMembershipId).toBe('mgr1');
    expect(created.status).toBeUndefined();
  });

  it('revokes once and is idempotent-safe on double revoke', async () => {
    const tx = {
      accessDenial: {
        findFirst: jest.fn().mockResolvedValue({ id: 'd1', status: 'ACTIVE' }),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
    };
    const service = new DenialService();

    await service.revokeDenial(tx as any, 't1', 'd1');
    expect(tx.accessDenial.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: expect.objectContaining({ status: 'REVOKED' }),
    });

    (tx.accessDenial.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      status: 'REVOKED',
    });
    await expect(
      service.revokeDenial(tx as any, 't1', 'd1'),
    ).rejects.toBeInstanceOf(DenialInvalidStateError);
  });

  it('never matches another tenant (G2-6 service level)', async () => {
    const tx = {
      accessDenial: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new DenialService();

    await service.listDenials(tx as any, 't1', {});

    expect(tx.accessDenial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1' }),
      }),
    );
  });
});
