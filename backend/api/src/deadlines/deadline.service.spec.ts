import { DeadlineService } from './deadline.service';
import {
  DeadlineAccessDeniedError,
  DeadlineInvalidStateError,
  DeadlineNotFoundError,
} from './deadline.errors';

describe('DeadlineService', () => {
  let service: DeadlineService;

  beforeEach(() => {
    service = new DeadlineService();
  });

  describe('createDeadline', () => {
    it('creates a deadline in the tenant when related entities are visible', async () => {
      const tx = {
        case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
        deadlineRule: {
          findFirst: jest.fn().mockResolvedValue({ id: 'rule-1' }),
        },
        membership: {
          findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }),
        },
        deadline: {
          create: jest.fn().mockResolvedValue({ id: 'deadline-1' }),
        },
      } as any;

      const created = await service.createDeadline(tx as any, 'tenant-1', {
        caseId: 'case-1',
        title: 'File brief',
        deadlineType: 'FIXED',
        dueDate: '2026-09-20T00:00:00.000Z',
        ruleId: 'rule-1',
        assignedUserId: 'member-1',
      } as any);

      expect(created).toEqual({ id: 'deadline-1' });
      expect(tx.deadline.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          caseId: 'case-1',
        }),
      });
    });

    it('rejects a deadline whose case is not in the tenant', async () => {
      const tx = {
        case: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.createDeadline(tx as any, 'tenant-1', {
          caseId: 'case-foreign',
          title: 'X',
        } as any),
      ).rejects.toBeInstanceOf(DeadlineAccessDeniedError);
    });

    it('rejects when the assigned user is not in the tenant', async () => {
      const tx = {
        case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
        membership: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.createDeadline(tx as any, 'tenant-1', {
          caseId: 'case-1',
          assignedUserId: 'member-foreign',
        } as any),
      ).rejects.toBeInstanceOf(DeadlineAccessDeniedError);
    });
  });

  describe('completeDeadline', () => {
    it('completes a pending deadline', async () => {
      const tx = {
        deadline: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'deadline-1', status: 'PENDING' }),
          update: jest.fn().mockResolvedValue({
            id: 'deadline-1',
            status: 'COMPLETED',
          }),
        },
      } as any;

      const result = await service.completeDeadline(
        tx as any,
        'tenant-1',
        'deadline-1',
        { completionEvidence: 'filed' } as any,
      );

      expect(result.status).toBe('COMPLETED');
      expect(tx.deadline.update).toHaveBeenCalledWith({
        where: { id: 'deadline-1' },
        data: {
          status: 'COMPLETED',
          completionEvidence: 'filed',
        },
      });
    });

    it('rejects completing an already-completed deadline', async () => {
      const tx = {
        deadline: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'deadline-1', status: 'COMPLETED' }),
        },
      } as any;

      await expect(
        service.completeDeadline(tx as any, 'tenant-1', 'deadline-1', {
          completionEvidence: 'x',
        } as any),
      ).rejects.toBeInstanceOf(DeadlineInvalidStateError);
    });

    it('rejects when the deadline is not in the tenant', async () => {
      const tx = {
        deadline: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.completeDeadline(tx as any, 'tenant-1', 'deadline-foreign', {
          completionEvidence: 'x',
        } as any),
      ).rejects.toBeInstanceOf(DeadlineNotFoundError);
    });
  });
});
