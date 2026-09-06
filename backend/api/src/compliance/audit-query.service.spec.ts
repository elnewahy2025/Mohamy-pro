import { AuditQueryService } from './audit-query.service';

describe('AuditQueryService', () => {
  it('caps search results and exports with a watermark', async () => {
    const tx = {
      auditEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            eventType: 'intake.created',
            category: 'AUDIT',
            outcome: 'SUCCEEDED',
            actorMembershipId: 'm1',
            targetType: 'IntakeRequest',
            targetId: 'i1',
            occurredAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]),
      },
    };
    const service = new AuditQueryService();

    await service.search(tx as any, 't1', { eventType: 'intake.created' });
    expect(tx.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          eventType: 'intake.created',
        }),
        take: 100,
      }),
    );

    const csv = await service.exportCsv(tx as any, 't1', {});
    expect(tx.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000 }),
    );
    expect(csv).toContain('tenant=t1');
    expect(csv).toContain('intake.created');
  });
});
