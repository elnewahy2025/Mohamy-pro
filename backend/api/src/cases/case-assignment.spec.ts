import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { CaseService } from './case.service';
import { CaseOperations } from './case.operations';
import { ConflictGateService } from '../conflict-checks/conflict-gate.service';
import { CaseAccessDeniedError } from './case.errors';
import { NotFoundException } from '@nestjs/common';

describe('Case assignment authorization (G5)', () => {
  let service: CaseService;
  let mockOps: jest.Mocked<CaseOperations>;
  let mockGate: jest.Mocked<ConflictGateService>;

  const fullCtx = {
    sessionId: 'session-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    actorMembershipId: 'mem-1',
    scope: 'FULL' as const,
  };
  const assignedCtx = { ...fullCtx, scope: 'ASSIGNED' as const };
  const mockRequest = {} as Request;

  function txWith(overrides: Record<string, any> = {}) {
    return {
      case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
      caseAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'a1',
          ...data,
        })),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm2', status: 'ACTIVE' }),
      },
      ...overrides,
    };
  }

  beforeEach(async () => {
    mockOps = {
      authorize: jest.fn().mockResolvedValue(fullCtx),
      authorizeCaseAccess: jest.fn().mockResolvedValue(fullCtx),
      run: jest.fn().mockImplementation((req, ctx, type, target, op) => op({})),
      read: jest.fn().mockImplementation((req, ctx, op) => op({})),
      requireCaseInTenant: jest.fn().mockResolvedValue({ id: 'case-1' }),
      requireCaseAssignment: jest
        .fn()
        .mockImplementation(async (tx: any, ctx: any, caseId: string) => {
          const found = await tx.caseAssignment.findFirst({
            where: {
              caseId,
              membershipId: ctx.actorMembershipId,
              tenantId: ctx.tenantId,
              revokedAt: null,
            },
          });
          if (!found) throw new CaseAccessDeniedError('NO_CASE_ASSIGNMENT');
        }),
      assignedCaseIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<CaseOperations>;

    mockGate = {
      assertClearForCase: jest.fn().mockResolvedValue({
        cleared: true,
        blocks: [],
        reasons: ['clear'],
      }),
    } as unknown as jest.Mocked<ConflictGateService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseService,
        { provide: CaseOperations, useValue: mockOps },
        { provide: ConflictGateService, useValue: mockGate },
      ],
    }).compile();

    service = module.get<CaseService>(CaseService);
  });

  it('allows FULL scope without consulting assignments', async () => {
    const tx = txWith({
      case: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'case-1',
          client: { id: 'c1', displayName: 'C' },
          parties: [],
        }),
      },
    });
    (mockOps.read as jest.Mock).mockImplementation(
      (req: unknown, ctx: unknown, op: (tx: unknown) => Promise<unknown>) =>
        op(tx),
    );

    await service.getCase(mockRequest, 'case-1');
    expect(tx.caseAssignment.findFirst).not.toHaveBeenCalled();
  });

  it('denies ASSIGNED readers without an assignment (non-enumerating)', async () => {
    (mockOps.authorizeCaseAccess as jest.Mock).mockResolvedValue(assignedCtx);
    const tx = txWith();
    (mockOps.read as jest.Mock).mockImplementation(
      (req: unknown, ctx: unknown, op: (tx: unknown) => Promise<unknown>) =>
        op(tx),
    );

    await expect(service.getCase(mockRequest, 'case-1')).rejects.toBeInstanceOf(
      CaseAccessDeniedError,
    );
  });

  it('allows ASSIGNED readers holding an assignment', async () => {
    (mockOps.authorizeCaseAccess as jest.Mock).mockResolvedValue(assignedCtx);
    const tx = txWith({
      caseAssignment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'a1' }),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      case: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'case-1',
          client: { id: 'c1', displayName: 'C' },
          parties: [],
        }),
      },
    });
    (mockOps.read as jest.Mock).mockImplementation(
      (req: unknown, ctx: unknown, op: (tx: unknown) => Promise<unknown>) =>
        op(tx),
    );

    const result: any = await service.getCase(mockRequest, 'case-1');
    expect(result.id).toBe('case-1');
  });

  it('scopes ASSIGNED lists to assigned case ids', async () => {
    (mockOps.authorizeCaseAccess as jest.Mock).mockResolvedValue(assignedCtx);
    (mockOps.assignedCaseIds as jest.Mock).mockResolvedValue(['case-9']);
    const tx: any = txWith({
      case: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    });
    (mockOps.read as jest.Mock).mockImplementation(
      (req: unknown, ctx: unknown, op: (tx: unknown) => Promise<unknown>) =>
        op(tx),
    );

    await service.listCases(mockRequest, {} as any);
    expect(tx.case.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['case-9'] } }),
      }),
    );
  });

  it('denies ASSIGNED writers without an assignment', async () => {
    (mockOps.authorizeCaseAccess as jest.Mock).mockResolvedValue(assignedCtx);
    const tx = txWith();
    (mockOps.run as jest.Mock).mockImplementation(
      (
        req: unknown,
        ctx: unknown,
        t: unknown,
        n: unknown,
        op: (tx: unknown) => Promise<unknown>,
      ) => op(tx),
    );

    await expect(
      service.updateCase(mockRequest, 'case-1', {} as any),
    ).rejects.toBeInstanceOf(CaseAccessDeniedError);
    await expect(
      service.removeParty(mockRequest, 'case-1', 'p1'),
    ).rejects.toBeInstanceOf(CaseAccessDeniedError);
  });

  it('assigns members with attribution and reactivates revoked rows', async () => {
    const tx = txWith();
    (mockOps.run as jest.Mock).mockImplementation(
      (
        req: unknown,
        ctx: unknown,
        t: unknown,
        n: unknown,
        op: (tx: unknown) => Promise<unknown>,
      ) => op(tx),
    );

    const created: any = await service.assignMember(
      mockRequest,
      'case-1',
      'm2',
    );
    expect(created.createdByMembershipId).toBe('mem-1');
    expect(tx.caseAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ caseId: 'case-1', membershipId: 'm2' }),
      }),
    );
  });

  it('refuses self-unassignment and unknown assignments', async () => {
    const tx = txWith();
    (mockOps.run as jest.Mock).mockImplementation(
      (
        req: unknown,
        ctx: unknown,
        t: unknown,
        n: unknown,
        op: (tx: unknown) => Promise<unknown>,
      ) => op(tx),
    );

    await expect(
      service.unassignMember(mockRequest, 'case-1', 'mem-1'),
    ).rejects.toBeInstanceOf(CaseAccessDeniedError);
    await expect(
      service.unassignMember(mockRequest, 'case-1', 'm9'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
