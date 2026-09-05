import { TimerService } from './timer.service';
import { TimerStatus } from '@prisma/client';

describe('TimerService', () => {
  it('pauses running timers before starting a new one', async () => {
    const prisma = {
      timer: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'tm1' }),
      },
    };
    const service = new TimerService(prisma as any);

    await service.startTimer('t1', 'u1', { description: 'Work' } as any);

    expect(prisma.timer.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', userId: 'u1', status: TimerStatus.RUNNING },
      data: { status: TimerStatus.PAUSED },
    });
    const data = (prisma.timer.create as jest.Mock).mock.calls[0][0].data;
    expect(data.tenantId).toBe('t1');
    expect(data.userId).toBe('u1');
    expect(data.status).toBe(TimerStatus.RUNNING);
  });

  it('stops only the owner timer and derives entry minutes', async () => {
    const prisma = {
      timer: {
        update: jest.fn().mockResolvedValue({
          userId: 'u1',
          caseId: 'c1',
          clientId: null,
          description: null,
          accumulatedSeconds: 61,
        }),
      },
      timeEntry: { create: jest.fn().mockResolvedValue({ id: 'e1' }) },
    };
    const service = new TimerService(prisma as any);

    await service.stopTimerAndCreateEntry('t1', 'u1', 'tm1');

    expect(prisma.timer.update).toHaveBeenCalledWith({
      where: { id: 'tm1', tenantId: 't1', userId: 'u1' },
      data: { status: TimerStatus.COMPLETED },
    });
    const data = (prisma.timeEntry.create as jest.Mock).mock.calls[0][0].data;
    expect(data.durationMinutes).toBe(2);
    expect(data.tenantId).toBe('t1');
    expect(data.userId).toBe('u1');
  });
});
