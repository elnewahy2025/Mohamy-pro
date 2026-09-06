import { ScheduleService } from './schedule.service';

describe('ScheduleService', () => {
  it('computes next daily and weekly runs', () => {
    const service = new ScheduleService({} as never, {} as never);

    const daily = service.computeNextRun(
      'DAILY',
      '09:00',
      new Date('2026-05-02T10:00:00Z'),
    );
    expect(daily.toISOString()).toBe('2026-05-03T09:00:00.000Z');

    const sameDay = service.computeNextRun(
      'DAILY',
      '09:00',
      new Date('2026-05-02T08:00:00Z'),
    );
    expect(sameDay.toISOString()).toBe('2026-05-02T09:00:00.000Z');

    const weekly = service.computeNextRun(
      'WEEKLY',
      '09:00',
      new Date('2026-05-02T10:00:00Z'),
    );
    expect(weekly.toISOString()).toBe('2026-05-09T09:00:00.000Z');
  });

  it('requires the definition to live in the tenant', async () => {
    const tx = {
      reportDefinition: { findFirst: jest.fn().mockResolvedValue(null) },
      reportSchedule: { create: jest.fn() },
    };
    const service = new ScheduleService({} as never, {} as never);

    await expect(
      service.create(tx as any, 't1', 'u1', {
        definitionId: 'missing',
        frequency: 'DAILY',
        runAt: '09:00',
      } as any),
    ).rejects.toThrow('Report not found');
    expect(tx.reportSchedule.create).not.toHaveBeenCalled();
  });
});

describe('ScheduleService sweep claim', () => {
  it('skips schedules lost to a concurrent worker', async () => {
    const tx = {
      reportSchedule: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
      reportRun: { create: jest.fn() },
    };
    const prisma = {
      reportSchedule: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 's1',
              tenantId: 't1',
              definitionId: 'd1',
              frequency: 'DAILY',
              runAt: '09:00',
              enabled: true,
              nextRunAt: new Date('2026-01-01T09:00:00Z'),
            },
          ]),
      },
      withWorkerTenantContext: jest
        .fn()
        .mockImplementation(async (_t: string, _o: string, fn: any) => fn(tx)),
    };
    const runs = { execute: jest.fn() };
    const service = new ScheduleService(prisma as never, runs as never);

    await service.sweepDueSchedules();

    expect(tx.reportSchedule.updateMany).toHaveBeenCalled();
    expect(runs.execute).not.toHaveBeenCalled();
    expect(tx.reportRun.create).not.toHaveBeenCalled();
  });

  it('claims then executes and reschedules', async () => {
    const tx = {
      reportSchedule: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      reportRun: { create: jest.fn() },
    };
    const prisma = {
      reportSchedule: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 's1',
              tenantId: 't1',
              definitionId: 'd1',
              frequency: 'DAILY',
              runAt: '09:00',
              enabled: true,
              nextRunAt: new Date('2026-01-01T09:00:00Z'),
            },
          ]),
      },
      withWorkerTenantContext: jest
        .fn()
        .mockImplementation(async (_t: string, _o: string, fn: any) => fn(tx)),
    };
    const runs = {
      execute: jest.fn().mockResolvedValue({ columns: [], rows: [], total: 3 }),
    };
    const service = new ScheduleService(prisma as never, runs as never);

    await service.sweepDueSchedules();

    expect(runs.execute).toHaveBeenCalled();
    expect(tx.reportRun.create).toHaveBeenCalled();
    expect(tx.reportSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' } }),
    );
  });
});
