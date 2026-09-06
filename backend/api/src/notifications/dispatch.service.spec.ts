import { DispatchService } from './dispatch.service';

function preferences(overrides: Record<string, unknown> = {}) {
  return {
    channelAllowed: jest
      .fn()
      .mockResolvedValue({ allowed: true, deferUntil: null }),
    ...overrides,
  };
}

describe('DispatchService', () => {
  it('notifies assignees and skips members who opted out', async () => {
    const tx = {
      notificationRule: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'r1', audience: 'ASSIGNEES' }]),
      },
      caseAssignment: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ membershipId: 'm1' }, { membershipId: 'm2' }]),
      },
      membership: { findMany: jest.fn() },
      notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
    };
    const prefs = preferences({
      channelAllowed: jest
        .fn()
        .mockResolvedValueOnce({ allowed: true, deferUntil: null })
        .mockResolvedValueOnce({ allowed: false, deferUntil: null }),
    });
    const service = new DispatchService(prefs as never);

    const created = await service.dispatch(tx as any, 't1', {
      eventType: 'INVOICE_ISSUED',
      caseId: 'c1',
      title: 'Invoice issued',
      body: 'Total 100',
    });

    expect(created).toBe(1);
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
  });

  it('defers sends inside quiet hours instead of dropping', async () => {
    const deferred = new Date('2026-05-02T03:00:00Z');
    const tx = {
      notificationRule: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'r1', audience: 'ALL_MEMBERS' }]),
      },
      membership: {
        findMany: jest.fn().mockResolvedValue([{ id: 'm1' }]),
      },
      notification: {
        create: jest.fn().mockImplementation(({ data }: any) => data),
      },
    };
    const prefs = preferences({
      channelAllowed: jest
        .fn()
        .mockResolvedValue({ allowed: false, deferUntil: deferred }),
    });
    const service = new DispatchService(prefs as never);

    const created = await service.dispatch(tx as any, 't1', {
      eventType: 'HEARING_SCHEDULED',
      title: 'Hearing',
      body: 'Soon',
    });

    expect(created).toBe(1);
    expect(tx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          scheduledFor: deferred,
        }),
      }),
    );
  });

  it('creates nothing when no rules match', async () => {
    const tx = {
      notificationRule: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { create: jest.fn() },
    };
    const service = new DispatchService(preferences() as never);

    const created = await service.dispatch(tx as any, 't1', {
      eventType: 'INVOICE_ISSUED',
      title: 'x',
      body: 'y',
    });

    expect(created).toBe(0);
    expect(tx.notification.create).not.toHaveBeenCalled();
  });
});
