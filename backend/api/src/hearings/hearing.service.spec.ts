import { HearingService } from './hearing.service';
import {
  HearingAccessDeniedError,
  HearingInvalidStateError,
  HearingNotFoundError,
} from './hearing.errors';

describe('HearingService', () => {
  let service: HearingService;

  beforeEach(() => {
    service = new HearingService();
  });

  describe('createHearing', () => {
    it('creates a hearing in the tenant when all related entities are visible', async () => {
      const tx = {
        case: {
          findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }),
        },
        court: {
          findFirst: jest.fn().mockResolvedValue({ id: 'court-1' }),
        },
        courtLocation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'courtloc-1' }),
        },
        membership: {
          findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }),
        },
        hearing: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'hearing-1' }),
        },
      } as any;

      const created = await service.createHearing(tx as any, 'tenant-1', {
        caseId: 'case-1',
        courtId: 'court-1',
        courtLocationId: 'courtloc-1',
        assignedLawyerId: 'member-1',
        date: '2026-09-10T09:00:00.000Z',
      } as any);

      expect(created).toEqual({ id: 'hearing-1' });
      expect(tx.hearing.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          caseId: 'case-1',
        }),
      });
    });

    it('rejects a hearing whose case is not in the tenant', async () => {
      const tx = {
        case: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.createHearing(tx as any, 'tenant-1', {
          caseId: 'case-foreign',
        } as any),
      ).rejects.toBeInstanceOf(HearingAccessDeniedError);
    });

    it('rejects when the assigned lawyer is not in the tenant', async () => {
      const tx = {
        case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
        membership: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.createHearing(tx as any, 'tenant-1', {
          caseId: 'case-1',
          assignedLawyerId: 'member-foreign',
        } as any),
      ).rejects.toBeInstanceOf(HearingAccessDeniedError);
    });
  });

  describe('recordOutcome', () => {
    it('records an outcome only for a schedulable hearing', async () => {
      const tx = {
        hearing: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'hearing-1', status: 'SCHEDULED' }),
          update: jest.fn().mockResolvedValue({
            id: 'hearing-1',
            outcome: 'CONCLUDED',
            status: 'COMPLETED',
          }),
        },
      } as any;

      const result = await service.recordOutcome(
        tx as any,
        'tenant-1',
        'hearing-1',
        { outcome: 'CONCLUDED', status: 'COMPLETED' } as any,
      );

      expect(result.status).toBe('COMPLETED');
      expect(tx.hearing.update).toHaveBeenCalledWith({
        where: { id: 'hearing-1' },
        data: { outcome: 'CONCLUDED', status: 'COMPLETED' },
      });
    });

    it('rejects invalid status transitions', async () => {
      const tx = {
        hearing: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'hearing-1', status: 'CANCELLED' }),
        },
      } as any;

      await expect(
        service.recordOutcome(tx as any, 'tenant-1', 'hearing-1', {
          outcome: 'X',
          status: 'COMPLETED',
        } as any),
      ).rejects.toBeInstanceOf(HearingInvalidStateError);
    });

    it('rejects when the hearing does not exist in the tenant', async () => {
      const tx = {
        hearing: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.recordOutcome(tx as any, 'tenant-1', 'hearing-missing', {
          outcome: 'X',
          status: 'COMPLETED',
        } as any),
      ).rejects.toBeInstanceOf(HearingNotFoundError);
    });
  });

  describe('deleteHearing', () => {
    it('rejects deleting a hearing outside the tenant', async () => {
      const tx = {
        hearing: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.deleteHearing(tx as any, 'tenant-1', 'hearing-foreign'),
      ).rejects.toBeInstanceOf(HearingNotFoundError);
    });
  });
});
