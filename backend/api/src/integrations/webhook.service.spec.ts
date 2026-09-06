import { WebhookService } from './webhook.service';
import { IntegrationsInvalidStateError } from './integrations.errors';

describe('WebhookService', () => {
  it('rejects non-https URLs and unknown events', async () => {
    const tx = { webhookEndpoint: { create: jest.fn() } };
    const service = new WebhookService();

    await expect(
      service.register(tx as any, 't1', 'u1', {
        url: 'http://example.com/hook',
        events: ['case.created'],
      } as any),
    ).rejects.toBeInstanceOf(IntegrationsInvalidStateError);

    await expect(
      service.register(tx as any, 't1', 'u1', {
        url: 'https://example.com/hook',
        events: ['nope.happened'],
      } as any),
    ).rejects.toBeInstanceOf(IntegrationsInvalidStateError);
    expect(tx.webhookEndpoint.create).not.toHaveBeenCalled();
  });

  it('returns the secret once and never stores or returns it again', async () => {
    const tx = {
      webhookEndpoint: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'w1',
          url: data.url,
          events: data.events,
          secretHash: data.secretHash,
          status: 'ENABLED',
        })),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'w1',
            url: 'https://example.com/hook',
            events: ['case.created'],
            secretHash: 'abc123',
            status: 'ENABLED',
          },
        ]),
      },
    };
    const service = new WebhookService();

    const { endpoint, secret } = await service.register(tx as any, 't1', 'u1', {
      url: 'https://example.com/hook',
      events: ['case.created'],
    } as any);

    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(20);
    expect(endpoint).not.toHaveProperty('secretHash');
    expect(endpoint).toMatchObject({ hasSecret: true });
    const stored = (tx.webhookEndpoint.create as jest.Mock).mock.calls[0][0]
      .data.secretHash;
    expect(stored).not.toBe(secret);
    expect(stored).toHaveLength(64);

    const listed = await service.list(tx as any, 't1');
    expect(listed[0]).not.toHaveProperty('secretHash');
  });

  it('rotates only enabled webhooks', async () => {
    const tx = {
      webhookEndpoint: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'w1', status: 'DISABLED' }),
        update: jest.fn(),
      },
    };
    const service = new WebhookService();

    await expect(service.rotate(tx as any, 't1', 'w1')).rejects.toBeInstanceOf(
      IntegrationsInvalidStateError,
    );
    expect(tx.webhookEndpoint.update).not.toHaveBeenCalled();
  });
});
