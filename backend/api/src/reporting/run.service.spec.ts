import { RunService } from './run.service';
import { ReportingInvalidStateError } from './reporting.errors';

function service() {
  const resourceAccess = {
    requireAssignedCase: jest.fn(),
    assignedCaseIds: jest.fn().mockResolvedValue(['case-9']),
  };
  return {
    resourceAccess,
    svc: new RunService(resourceAccess as never),
  };
}

describe('RunService', () => {
  it('projects allowlisted columns and sorts', async () => {
    const tx = {
      reportDefinition: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'r1',
          dataSource: 'CASE',
          columns: ['caseNumber', 'status'],
          sortBy: 'caseNumber',
          sortDir: 'desc',
          groupBy: null,
        }),
      },
      case: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a', caseNumber: 'C-002', status: 'OPEN', tokenHash: 'x' },
          { id: 'b', caseNumber: 'C-001', status: 'OPEN', tokenHash: 'y' },
        ]),
      },
    };
    const { svc } = service();

    const output = await svc.execute(tx as any, 't1', 'r1');

    expect(output.columns).toEqual(['caseNumber', 'status']);
    expect(output.rows.map((r) => r.caseNumber)).toEqual(['C-002', 'C-001']);
    expect(output.rows[0]).not.toHaveProperty('tokenHash');
    expect(output.total).toBe(2);
  });

  it('constrains assigned scope to assigned cases', async () => {
    const tx = {
      reportDefinition: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'r1',
          dataSource: 'TASK',
          columns: ['title'],
          sortBy: null,
          groupBy: null,
        }),
      },
      task: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const { svc, resourceAccess } = service();

    await svc.execute(tx as any, 't1', 'r1', {
      scope: 'ASSIGNED',
      membershipId: 'mem-1',
    });

    expect(resourceAccess.assignedCaseIds).toHaveBeenCalledWith(
      tx,
      't1',
      'mem-1',
    );
    expect(tx.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ caseId: { in: ['case-9'] } }),
      }),
    );
  });

  it('rejects oversized results instead of truncating silently', async () => {
    const tx = {
      reportDefinition: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'r1',
          dataSource: 'CLIENT',
          columns: ['displayName'],
          sortBy: null,
          groupBy: null,
        }),
      },
      client: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            Array.from({ length: 1001 }, (_, i) => ({ id: `${i}` })),
          ),
      },
    };
    const { svc } = service();

    await expect(svc.execute(tx as any, 't1', 'r1')).rejects.toBeInstanceOf(
      ReportingInvalidStateError,
    );
  });

  it('groups rows when requested', async () => {
    const tx = {
      reportDefinition: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'r1',
          dataSource: 'CASE',
          columns: ['status'],
          sortBy: null,
          groupBy: 'status',
        }),
      },
      case: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a', status: 'OPEN' },
          { id: 'b', status: 'CLOSED' },
          { id: 'c', status: 'OPEN' },
        ]),
      },
    };
    const { svc } = service();

    const output = await svc.execute(tx as any, 't1', 'r1');

    expect(Object.keys(output.grouped ?? {}).sort()).toEqual([
      'CLOSED',
      'OPEN',
    ]);
    expect(output.grouped?.OPEN).toHaveLength(2);
  });
});

describe('RunService revalidation and filters', () => {
  it('rejects stored definitions with non-allowlisted sortBy', async () => {
    const tx = {
      reportDefinition: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'r1',
          dataSource: 'CASE',
          columns: ['caseNumber'],
          filters: {},
          groupBy: null,
          sortBy: 'tokenHash',
          sortDir: 'asc',
        }),
      },
      case: { findMany: jest.fn() },
    };
    const resourceAccess = { assignedCaseIds: jest.fn() };
    const svc = new RunService(resourceAccess as never);

    await expect(svc.execute(tx as any, 't1', 'r1')).rejects.toBeInstanceOf(
      ReportingInvalidStateError,
    );
    expect(tx.case.findMany).not.toHaveBeenCalled();
  });

  it('applies allowlisted equality filters to the query', async () => {
    const tx = {
      reportDefinition: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'r1',
          dataSource: 'CASE',
          columns: ['caseNumber', 'status'],
          filters: { status: 'OPEN' },
          groupBy: null,
          sortBy: null,
          sortDir: null,
        }),
      },
      case: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ caseNumber: 'C-001', status: 'OPEN' }]),
      },
    };
    const resourceAccess = { assignedCaseIds: jest.fn() };
    const svc = new RunService(resourceAccess as never);

    const output = await svc.execute(tx as any, 't1', 'r1');

    expect(tx.case.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1' }),
      }),
    );
    const where = (tx.case.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.AND).toEqual([{ status: 'OPEN' }]);
    expect(output.total).toBe(1);
  });
});
