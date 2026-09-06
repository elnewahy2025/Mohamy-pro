import { HoldService } from './hold.service';
import { ComplianceInvalidStateError } from './compliance.errors';

describe('HoldService', () => {
  it('rejects targetId without a targetType scope', async () => {
    const tx = { legalHold: { create: jest.fn() } };
    const service = new HoldService();

    await expect(
      service.create(tx as any, 't1', 'u1', {
        name: 'Matter X',
        reason: 'Litigation anticipated.',
        targetId: 'a1',
      } as any),
    ).rejects.toBeInstanceOf(ComplianceInvalidStateError);
    expect(tx.legalHold.create).not.toHaveBeenCalled();
  });

  it('creates scoped holds and releases only ACTIVE ones', async () => {
    const tx = {
      legalHold: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'h1',
          status: 'ACTIVE',
          ...data,
        })),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'h1', status: 'RELEASED' }),
        update: jest.fn(),
      },
    };
    const service = new HoldService();

    const created: any = await service.create(tx as any, 't1', 'u1', {
      name: 'Matter X',
      reason: 'Litigation anticipated.',
      targetType: 'CASE',
    } as any);
    expect(created.status).toBe('ACTIVE');

    await expect(
      service.release(tx as any, 't1', 'm1', 'h1', 'Matter closed'),
    ).rejects.toBeInstanceOf(ComplianceInvalidStateError);
    expect(tx.legalHold.update).not.toHaveBeenCalled();
  });
});
