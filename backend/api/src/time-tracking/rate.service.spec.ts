import { RateService } from './rate.service';

describe('RateService', () => {
  it('resolves CASE before CLIENT before USER before DEFAULT', async () => {
    const prisma = {
      rate: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'case-rate' })
          .mockResolvedValueOnce({ id: 'client-rate' })
          .mockResolvedValueOnce({ id: 'user-rate' })
          .mockResolvedValueOnce({ id: 'default-rate' }),
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
      },
    };
    const service = new RateService(prisma as any);

    const resolved = await service.calculateApplicableRate(
      't1',
      'u1',
      'c1',
      'case1',
    );

    expect(resolved).toEqual({ id: 'case-rate' });
    expect(prisma.rate.findFirst).toHaveBeenCalledTimes(1);
  });

  it('falls through to DEFAULT when nothing matches', async () => {
    const prisma = {
      rate: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'default-rate' }),
      },
    };
    const service = new RateService(prisma as any);

    const resolved = await service.calculateApplicableRate('t1', 'u1');

    expect(resolved).toEqual({ id: 'default-rate' });
    expect(prisma.rate.findFirst).toHaveBeenCalledTimes(2);
  });

  it('forces tenant and creator on create', async () => {
    const prisma = {
      rate: { create: jest.fn().mockResolvedValue({ id: 'r1' }) },
    };
    const service = new RateService(prisma as any);

    await service.createRate('t1', 'u1', {
      type: 'DEFAULT',
      referenceId: 'DEFAULT',
      hourlyRate: 100,
    } as any);

    const data = (prisma.rate.create as jest.Mock).mock.calls[0][0].data;
    expect(data.tenantId).toBe('t1');
    expect(data.createdBy).toBe('u1');
  });
});
