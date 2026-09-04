import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { CaseService } from './case.service';
import { CaseOperations } from './case.operations';
import { ConflictGateService } from '../conflict-checks/conflict-gate.service';
import { CaseGateRejectionError } from './case.errors';

describe('CaseService', () => {
  let service: CaseService;
  let mockOps: jest.Mocked<CaseOperations>;
  let mockGate: jest.Mocked<ConflictGateService>;

  const mockCtx = {
    sessionId: 'session-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    actorMembershipId: 'mem-1',
  };

  const mockRequest = {} as Request;

  beforeEach(async () => {
    mockOps = {
      authorize: jest.fn().mockResolvedValue(mockCtx),
      run: jest.fn().mockImplementation((req, ctx, type, target, op) => op({})),
      read: jest.fn().mockImplementation((req, ctx, op) => op({})),
      requireCaseInTenant: jest.fn().mockResolvedValue({ id: 'case-1' }),
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCase', () => {
    it('should create a case', async () => {
      const dto = {
        caseNumber: 'C-100',
        clientId: 'client-1',
        priority: 'HIGH' as const,
      };
      const mockCase = { id: 'case-1', ...dto, status: 'OPEN' };
      mockOps.run.mockImplementationOnce(async (req, ctx, type, target, op) => {
        const tx = {
          client: {
            findFirst: jest.fn().mockResolvedValue({ id: 'client-1' }),
          },
          case: { create: jest.fn().mockResolvedValue(mockCase) },
          party: { findMany: jest.fn().mockResolvedValue([]) },
          caseTimelineEvent: {
            create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
          },
        };
        return op(tx as any);
      });

      const result = await service.createCase(mockRequest, dto);
      expect(result).toEqual(mockCase);
    });

    it('should reject when the client is not in the tenant', async () => {
      const dto = { caseNumber: 'C-100', clientId: 'client-x' };
      mockOps.run.mockImplementationOnce(async (req, ctx, type, target, op) => {
        const tx = {
          client: { findFirst: jest.fn().mockResolvedValue(null) },
        };
        return op(tx as any);
      });

      await expect(service.createCase(mockRequest, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('addParty', () => {
    it('should link a party to a case when clearance is granted', async () => {
      const dto = { partyId: 'party-1', roleId: 'role-1' };
      const mockLink = {
        id: 'cp-1',
        caseId: 'case-1',
        ...dto,
        status: 'ACTIVE',
      };
      mockOps.run.mockImplementationOnce(async (req, ctx, type, target, op) => {
        const tx = {
          case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
          party: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'party-1',
              name: 'John',
              displayName: 'John',
            }),
          },
          partyRole: {
            findFirst: jest.fn().mockResolvedValue({ id: 'role-1' }),
          },
          caseParty: { create: jest.fn().mockResolvedValue(mockLink) },
          caseTimelineEvent: {
            create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
          },
        };
        return op(tx as any);
      });

      const result = await service.addParty(mockRequest, 'case-1', dto);
      expect(result).toEqual(mockLink);
      expect(mockGate.assertClearForCase).toHaveBeenCalled();
    });

    it('should reject adding a party that is blocked by a conflict check', async () => {
      const dto = { partyId: 'party-1', roleId: 'role-1' };
      mockGate.assertClearForCase.mockResolvedValue({
        cleared: false,
        blocks: [
          {
            partyName: 'John',
            decision: 'BLOCK' as const,
            reason: 'conflict',
            conflictCheckId: 'cc-1',
          },
        ],
        reasons: ['blocked'],
      });
      mockOps.run.mockImplementationOnce(async (req, ctx, type, target, op) => {
        const tx = {
          case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
          party: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'party-1',
              name: 'John',
              displayName: 'John',
            }),
          },
          partyRole: {
            findFirst: jest.fn().mockResolvedValue({ id: 'role-1' }),
          },
        };
        return op(tx as any);
      });

      await expect(
        service.addParty(mockRequest, 'case-1', dto),
      ).rejects.toBeInstanceOf(CaseGateRejectionError);
    });
  });

  describe('updateCase', () => {
    it('should update a case within the tenant', async () => {
      const dto = { status: 'ON_HOLD' as const };
      const updated = { id: 'case-1', ...dto };
      mockOps.run.mockImplementationOnce(async (req, ctx, type, target, op) => {
        const tx = {
          case: { update: jest.fn().mockResolvedValue(updated) },
          caseTimelineEvent: {
            create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
          },
        };
        return op(tx as any);
      });
      const result = await service.updateCase(mockRequest, 'case-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('removeParty', () => {
    it('should remove a party link from a case', async () => {
      mockOps.run.mockImplementationOnce(async (req, ctx, type, target, op) => {
        const tx = {
          case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
          caseParty: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        };
        return op(tx as any);
      });
      const result = await service.removeParty(
        mockRequest,
        'case-1',
        'party-1',
      );
      expect(result).toEqual({ removed: 1 });
    });
  });
});
