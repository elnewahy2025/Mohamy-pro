import { CaseTimelineService } from './case-timeline.service';
import { CaseTimelineAccessDeniedError } from './case-timeline.errors';

describe('CaseTimelineService', () => {
  let service: CaseTimelineService;

  beforeEach(() => {
    service = new CaseTimelineService({} as any);
  });

  describe('recordEvent', () => {
    it('appends an event to a case in the tenant', async () => {
      const created = { id: 'evt-1' };
      const tx = {
        case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
        caseTimelineEvent: {
          create: jest.fn().mockResolvedValue(created),
        },
      } as any;

      const result = await service.recordEvent(
        tx as any,
        'tenant-1',
        'user-1',
        'member-1',
        { caseId: 'case-1', eventType: 'CASE_CREATED' } as any,
      );

      expect(result).toEqual(created);
      expect(tx.caseTimelineEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          caseId: 'case-1',
          actorUserId: 'user-1',
          actorMembershipId: 'member-1',
        }),
      });
    });

    it('rejects appending to a case outside the tenant', async () => {
      const tx = {
        case: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.recordEvent(tx as any, 'tenant-1', 'user-1', 'member-1', {
          caseId: 'case-foreign',
          eventType: 'CASE_CREATED',
        } as any),
      ).rejects.toBeInstanceOf(CaseTimelineAccessDeniedError);
    });
  });

  describe('listTimeline', () => {
    it('returns a paginated, tenant-scoped timeline', async () => {
      const items = [{ id: 'evt-1' }];
      const tx = {
        caseTimelineEvent: {
          count: jest.fn().mockResolvedValue(1),
          findMany: jest.fn().mockResolvedValue(items),
        },
      } as any;

      const result = await service.listTimeline(
        tx as any,
        'tenant-1',
        'case-1',
        { page: 1, limit: 10 } as any,
      );

      expect(result).toEqual({
        data: items,
        pagination: { page: 1, limit: 10, total: 1 },
      });
      expect(tx.caseTimelineEvent.count).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', caseId: 'case-1' },
      });
    });
  });
});
