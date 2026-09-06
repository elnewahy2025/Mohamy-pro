import { BreakGlassService } from './breakglass.service';
import {
  BreakGlassInvalidStateError,
  BreakGlassNotFoundError,
} from './breakglass.errors';

function txWith(overrides: Record<string, unknown> = {}) {
  return {
    membership: {
      findFirst: jest.fn().mockResolvedValue({ id: 'm2', status: 'ACTIVE' }),
    },
    case: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    breakGlassActivation: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: any) => ({
        id: 'bg1',
        ...data,
      })),
      update: jest.fn().mockImplementation(({ data }: any) => data),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

describe('BreakGlassService (G7)', () => {
  it('activates with attribution inside the 24h window', async () => {
    const tx = txWith();
    const service = new BreakGlassService();

    const created: any = await service.activate(tx as any, 't1', 'mgr1', {
      subjectMembershipId: 'm2',
      caseId: 'c1',
      reason: 'Production outage triage',
    } as any);

    expect(created.tenantId).toBe('t1');
    expect(created.createdByMembershipId).toBe('mgr1');
    expect(tx.breakGlassActivation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subjectMembershipId: 'm2',
          caseId: 'c1',
        }),
      }),
    );
  });

  it('rejects inactive subjects, unknown cases, and bad windows', async () => {
    const service = new BreakGlassService();

    const suspendedTx = txWith();
    (suspendedTx.membership.findFirst as jest.Mock).mockResolvedValue({
      id: 'm2',
      status: 'SUSPENDED',
    });
    await expect(
      service.activate(suspendedTx as any, 't1', 'mgr1', {
        subjectMembershipId: 'm2',
        caseId: 'c1',
        reason: 'x',
      } as any),
    ).rejects.toBeInstanceOf(BreakGlassNotFoundError);

    const missingTx = txWith();
    (missingTx.case.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.activate(missingTx as any, 't1', 'mgr1', {
        subjectMembershipId: 'm2',
        caseId: 'missing',
        reason: 'x',
      } as any),
    ).rejects.toBeInstanceOf(BreakGlassNotFoundError);

    const pastTx = txWith();
    await expect(
      service.activate(pastTx as any, 't1', 'mgr1', {
        subjectMembershipId: 'm2',
        caseId: 'c1',
        reason: 'x',
        endsAt: new Date(Date.now() - 1000).toISOString(),
      } as any),
    ).rejects.toBeInstanceOf(BreakGlassInvalidStateError);

    const longTx = txWith();
    await expect(
      service.activate(longTx as any, 't1', 'mgr1', {
        subjectMembershipId: 'm2',
        caseId: 'c1',
        reason: 'x',
        endsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      } as any),
    ).rejects.toBeInstanceOf(BreakGlassInvalidStateError);
  });

  it('refuses overlapping active grants', async () => {
    const tx = txWith({
      breakGlassActivation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'bg0' }),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
    });
    const service = new BreakGlassService();

    await expect(
      service.activate(tx as any, 't1', 'mgr1', {
        subjectMembershipId: 'm2',
        caseId: 'c1',
        reason: 'x',
      } as any),
    ).rejects.toBeInstanceOf(BreakGlassInvalidStateError);
    expect(tx.breakGlassActivation.create).not.toHaveBeenCalled();
  });

  it('revokes once and lists only live grants', async () => {
    const tx = txWith({
      breakGlassActivation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'bg1', revokedAt: null }),
        create: jest.fn(),
        update: jest.fn().mockImplementation(({ data }: any) => data),
        findMany: jest.fn().mockResolvedValue([{ id: 'bg1' }]),
      },
    });
    const service = new BreakGlassService();

    const revoked: any = await service.revoke(tx as any, 't1', 'bg1');
    expect(revoked.revokedAt).toBeInstanceOf(Date);

    (tx.breakGlassActivation.findFirst as jest.Mock).mockResolvedValue({
      id: 'bg1',
      revokedAt: new Date(),
    });
    await expect(service.revoke(tx as any, 't1', 'bg1')).rejects.toBeInstanceOf(
      BreakGlassInvalidStateError,
    );

    const listed = await service.listActive(tx as any, 't1', 'c1');
    expect(listed).toHaveLength(1);
    expect(tx.breakGlassActivation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
      }),
    );
  });
});
