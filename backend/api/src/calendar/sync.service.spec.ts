import { SyncService } from './sync.service';
import {
  CalendarInvalidStateError,
  CalendarNotFoundError,
} from './calendar.errors';

function activeConnectionTx(overrides: Record<string, any> = {}) {
  return {
    calendarConnection: {
      findFirst: jest.fn().mockResolvedValue({ id: 'conn1', status: 'ACTIVE' }),
    },
    hearing: { findFirst: jest.fn().mockResolvedValue({ id: 'h1' }) },
    deadline: { findFirst: jest.fn().mockResolvedValue({ id: 'd1' }) },
    task: { findFirst: jest.fn().mockResolvedValue({ id: 't1' }) },
    calendarEventMapping: {
      upsert: jest.fn().mockImplementation(({ create }: any) => ({
        id: 'm1',
        ...create,
      })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    calendarSyncCursor: {
      upsert: jest.fn().mockImplementation(({ create }: any) => ({
        id: 'cur1',
        ...create,
      })),
    },
    calendarSyncConflict: {
      create: jest.fn().mockImplementation(({ data }: any) => ({
        id: 'cf1',
        resolution: 'PENDING',
        ...data,
      })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn().mockImplementation(({ data }: any) => data),
    },
    ...overrides,
  };
}

describe('SyncService', () => {
  it('upserts mappings idempotently (no duplicates on re-push)', async () => {
    const tx = activeConnectionTx();
    const service = new SyncService();

    const first: any = await service.push(tx as any, 't1', {
      connectionId: 'conn1',
      localType: 'HEARING',
      localId: 'h1',
    } as any);
    const second: any = await service.push(tx as any, 't1', {
      connectionId: 'conn1',
      localType: 'HEARING',
      localId: 'h1',
    } as any);

    expect(tx.calendarEventMapping.upsert).toHaveBeenCalledTimes(2);
    expect(
      (tx.calendarEventMapping.upsert as jest.Mock).mock.calls[0][0].where,
    ).toEqual({
      tenantId_connectionId_localType_localId: {
        tenantId: 't1',
        connectionId: 'conn1',
        localType: 'HEARING',
        localId: 'h1',
      },
    });
    expect(first.direction).toBe('PUSH');
    expect(second.direction).toBe('PUSH');
  });

  it('refuses push on disabled connections and unknown locals', async () => {
    const service = new SyncService();
    const disabledTx = activeConnectionTx();
    (disabledTx.calendarConnection.findFirst as jest.Mock).mockResolvedValue({
      id: 'conn1',
      status: 'DISABLED',
    });
    await expect(
      service.push(disabledTx as any, 't1', {
        connectionId: 'conn1',
        localType: 'HEARING',
        localId: 'h1',
      } as any),
    ).rejects.toBeInstanceOf(CalendarInvalidStateError);

    const missingTx = activeConnectionTx();
    (missingTx.hearing.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.push(missingTx as any, 't1', {
        connectionId: 'conn1',
        localType: 'HEARING',
        localId: 'missing',
      } as any),
    ).rejects.toBeInstanceOf(CalendarNotFoundError);
  });

  it('resolves conflicts once and keeps both sides until then', async () => {
    const tx = activeConnectionTx();
    (tx.calendarSyncConflict.findFirst as jest.Mock).mockResolvedValue({
      id: 'cf1',
      resolution: 'PENDING',
    });
    const service = new SyncService();

    await service.resolveConflict(tx as any, 't1', 'cf1', {
      resolution: 'LOCAL_WINS',
    } as any);
    expect(tx.calendarSyncConflict.update).toHaveBeenCalledWith({
      where: { id: 'cf1' },
      data: expect.objectContaining({ resolution: 'LOCAL_WINS' }),
    });

    (tx.calendarSyncConflict.findFirst as jest.Mock).mockResolvedValue({
      id: 'cf1',
      resolution: 'LOCAL_WINS',
    });
    await expect(
      service.resolveConflict(tx as any, 't1', 'cf1', {
        resolution: 'REMOTE_WINS',
      } as any),
    ).rejects.toBeInstanceOf(CalendarInvalidStateError);
  });

  it('builds a date-sorted agenda across hearings, deadlines, and tasks', async () => {
    const tx = {
      hearing: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'h1',
            date: new Date('2026-03-02T10:00:00Z'),
            hearingType: 'Trial',
          },
        ]),
      },
      deadline: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'd1',
            title: 'Filing',
            dueDate: new Date('2026-03-01T10:00:00Z'),
          },
        ]),
      },
      task: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 't1',
            title: 'Draft',
            dueDate: new Date('2026-03-03T10:00:00Z'),
          },
          { id: 't2', title: 'Undated', dueDate: null },
        ]),
      },
    };
    const service = new SyncService();

    const agenda = await service.agenda(
      tx as any,
      't1',
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-31T00:00:00Z'),
    );

    expect(agenda.map((a) => a.id)).toEqual(['d1', 'h1', 't1']);
    expect(agenda.map((a) => a.kind)).toEqual(['DEADLINE', 'HEARING', 'TASK']);
  });
});
