import { BackupPolicyService } from './policy.service';

describe('BackupPolicyService', () => {
  it('upserts one policy per tenant', async () => {
    const tx = {
      backupPolicy: {
        upsert: jest.fn().mockImplementation(({ create }: any) => create),
      },
    };
    const service = new BackupPolicyService();

    const policy: any = await service.set(tx as any, 't1', 'u1', {
      rpoHours: 24,
      rtoHours: 4,
      scheduleCron: '0 2 * * *',
      retentionDays: 90,
    } as any);

    expect(tx.backupPolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1' } }),
    );
    expect(policy.rpoHours).toBe(24);
  });
});

describe('BackupPolicyService cron validation', () => {
  it('rejects out-of-range cron fields', async () => {
    const tx = { backupPolicy: { upsert: jest.fn() } };
    const service = new BackupPolicyService();

    await expect(
      service.set(tx as any, 't1', 'u1', {
        rpoHours: 24,
        rtoHours: 4,
        scheduleCron: '99 99 99 99 99',
        retentionDays: 90,
      } as any),
    ).rejects.toThrow('scheduleCron');
    expect(tx.backupPolicy.upsert).not.toHaveBeenCalled();
  });
});
