import { TimeEntryService } from './time-entry.service';
import { TimeEntryStatus } from '@prisma/client';

describe('TimeEntryService', () => {
  it('forces tenant, owner, and DRAFT status on create', async () => {
    const prisma = {
      timeEntry: { create: jest.fn().mockResolvedValue({ id: 'e1' }) },
    };
    const service = new TimeEntryService(prisma as any);

    await service.createTimeEntry('t1', 'u1', {
      date: '2026-01-01',
      durationMinutes: 60,
      description: 'Review',
    } as any);

    const data = (prisma.timeEntry.create as jest.Mock).mock.calls[0][0].data;
    expect(data.tenantId).toBe('t1');
    expect(data.userId).toBe('u1');
    expect(data.status).toBe(TimeEntryStatus.DRAFT);
  });

  it('scopes reads to the tenant owner', async () => {
    const prisma = {
      timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new TimeEntryService(prisma as any);

    await service.getTimeEntries('t1', 'u1');

    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', userId: 'u1' },
      orderBy: { date: 'desc' },
    });
  });

  it('rejects with approver recorded, tenant-scoped', async () => {
    const prisma = {
      timeEntry: { update: jest.fn().mockResolvedValue({ id: 'e1' }) },
    };
    const service = new TimeEntryService(prisma as any);

    await service.rejectTimeEntry('t1', 'e1', 'mgr1');

    expect(prisma.timeEntry.update).toHaveBeenCalledWith({
      where: { id: 'e1', tenantId: 't1' },
      data: { status: TimeEntryStatus.REJECTED, approvedBy: 'mgr1' },
    });
  });

  it('scopes submit to the entry owner', async () => {
    const prisma = {
      timeEntry: { update: jest.fn().mockResolvedValue({ id: 'e1' }) },
    };
    const service = new TimeEntryService(prisma as any);

    await service.submitTimeEntry('t1', 'u1', 'e1');

    expect(prisma.timeEntry.update).toHaveBeenCalledWith({
      where: { id: 'e1', tenantId: 't1', userId: 'u1' },
      data: { status: TimeEntryStatus.SUBMITTED },
    });
  });
});
