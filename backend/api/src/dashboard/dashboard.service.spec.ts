import { DashboardService } from './dashboard.service';

function tx() {
  return {
    case: {
      groupBy: jest.fn().mockResolvedValue([
        { status: 'OPEN', _count: { _all: 2 } },
        { status: 'CLOSED', _count: { _all: 1 } },
      ]),
      count: jest.fn().mockResolvedValue(3),
    },
    hearing: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    deadline: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    task: { count: jest.fn().mockResolvedValue(0) },
    invoice: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([
        { currency: 'SAR', total: { toString: () => '100.50' } },
        { currency: 'SAR', total: { toString: () => '25.25' } },
      ]),
    },
    caseTimelineEvent: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { count: jest.fn().mockResolvedValue(4) },
  };
}

function service(assigned: string[] = ['case-1']) {
  const resourceAccess = {
    assignedCaseIds: jest.fn().mockResolvedValue(assigned),
  };
  return {
    resourceAccess,
    svc: new DashboardService(resourceAccess as never),
  };
}

describe('DashboardService', () => {
  it('aggregates open cases and sums unpaid totals exactly', async () => {
    const { svc } = service();
    const summary = await svc.getSummary(tx() as any, 't1', {
      scope: 'ASSIGNED',
      membershipId: 'm1',
      userId: 'u1',
    });

    expect(summary.cases.total).toBe(3);
    expect(summary.cases.open).toBe(2);
    expect(summary.billing.unpaidTotals).toEqual({ SAR: '125.75' });
    expect(summary.notifications.unread).toBe(4);
    const database = tx();
    const { svc: full } = service();
    const fullSummary = await full.getSummary(database as any, 't1', {
      scope: 'FULL',
      membershipId: 'm1',
      userId: 'u1',
    });
    expect(fullSummary.hearings.upcoming).toBe(0);
    expect(database.hearing.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: (database.hearing.findMany as jest.Mock).mock.calls[0][0].where,
      }),
    );
  });

  it('constrains case-derived queries to assigned cases', async () => {
    const { svc, resourceAccess } = service(['case-9']);
    const database = tx();

    await svc.getSummary(database as any, 't1', {
      scope: 'ASSIGNED',
      membershipId: 'm1',
      userId: 'u1',
    });

    expect(resourceAccess.assignedCaseIds).toHaveBeenCalledWith(
      database,
      't1',
      'm1',
    );
    expect(database.case.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1' }),
      }),
    );
    const where = (database.case.count as jest.Mock).mock.calls[0][0].where;
    expect(where.id).toEqual({ in: ['case-9'] });
  });

  it('skips the assignment filter for FULL scope', async () => {
    const { svc, resourceAccess } = service();
    const database = tx();

    await svc.getSummary(database as any, 't1', {
      scope: 'FULL',
      membershipId: 'm1',
      userId: 'u1',
    });

    expect(resourceAccess.assignedCaseIds).not.toHaveBeenCalled();
    const where = (database.case.count as jest.Mock).mock.calls[0][0].where;
    expect(where.id).toBeUndefined();
  });
});
