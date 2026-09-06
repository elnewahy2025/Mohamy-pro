import { RetentionService } from './retention.service';
import { HoldService } from './hold.service';

describe('RetentionService', () => {
  it('upserts one policy per target type', async () => {
    const tx = {
      retentionPolicy: {
        upsert: jest.fn().mockImplementation(({ create }: any) => create),
      },
    };
    const service = new RetentionService(new HoldService());

    const policy: any = await service.setPolicy(tx as any, 't1', 'u1', {
      targetType: 'AUDIT_EVENT',
      retainYears: 7,
    } as any);

    expect(tx.retentionPolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_targetType: { tenantId: 't1', targetType: 'AUDIT_EVENT' },
        },
      }),
    );
    expect(policy.retainYears).toBe(7);
  });

  it('subtracts held records from eligibility', async () => {
    const tx = {
      retentionPolicy: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { targetType: 'AUDIT_EVENT', retainYears: 7, enabled: true },
          ]),
      },
      legalHold: {
        findMany: jest.fn().mockResolvedValue([
          { targetType: null, targetId: null },
          { targetType: 'AUDIT_EVENT', targetId: 'e-2' },
        ]),
      },
      auditEvent: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'e-1' }, { id: 'e-2' }, { id: 'e-3' }]),
      },
    };
    const service = new RetentionService(new HoldService());

    const [row] = await service.evaluate(tx as any, 't1');

    expect(row.eligible).toBe(0);
    expect(row.held).toBe(3);
  });
});
