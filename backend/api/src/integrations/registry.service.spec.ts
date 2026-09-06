import { RegistryService } from './registry.service';
import { IntegrationsInvalidStateError } from './integrations.errors';

describe('RegistryService', () => {
  it('rejects unknown integration keys', async () => {
    const tx = { integration: { upsert: jest.fn() } };
    const service = new RegistryService();

    await expect(
      service.set(tx as any, 't1', 'u1', 'NOPE', { enabled: true } as any),
    ).rejects.toBeInstanceOf(IntegrationsInvalidStateError);
    expect(tx.integration.upsert).not.toHaveBeenCalled();
  });

  it('rejects secret-like config keys', async () => {
    const tx = { integration: { upsert: jest.fn() } };
    const service = new RegistryService();

    await expect(
      service.set(tx as any, 't1', 'u1', 'EMAIL', {
        enabled: true,
        config: { smtpPassword: 'x' },
      } as any),
    ).rejects.toBeInstanceOf(IntegrationsInvalidStateError);
    expect(tx.integration.upsert).not.toHaveBeenCalled();
  });

  it('upserts scoped records and reports health for every key', async () => {
    const tx = {
      integration: {
        upsert: jest.fn().mockImplementation(({ create }: any) => create),
        findMany: jest.fn().mockResolvedValue([
          {
            key: 'EMAIL',
            enabled: true,
            status: 'ENABLED',
            errorMessage: null,
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]),
      },
    };
    const service = new RegistryService();

    const saved: any = await service.set(tx as any, 't1', 'u1', 'EMAIL', {
      enabled: true,
      config: { sender: 'firm@example.com' },
    } as any);

    expect(tx.integration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_key: { tenantId: 't1', key: 'EMAIL' } },
      }),
    );
    expect(saved.enabled).toBe(true);

    const health = await service.health(tx as any, 't1');
    expect(health).toHaveLength(8);
    expect(health.find((h) => h.key === 'EMAIL')).toMatchObject({
      enabled: true,
      status: 'ENABLED',
    });
    expect(health.find((h) => h.key === 'SMS')).toMatchObject({
      enabled: false,
      status: 'DISABLED',
    });
  });
});
