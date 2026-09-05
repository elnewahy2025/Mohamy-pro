import { DeliveryService } from './delivery.service';
import { CommunicationsInvalidStateError } from './communications.errors';

describe('DeliveryService', () => {
  it('advances QUEUED to SENT and stamps sentAt', async () => {
    const tx = {
      message: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'm1',
          status: 'QUEUED',
          sentAt: null,
        }),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
    };
    const service = new DeliveryService();
    const updated: any = await service.recordStatus(tx as any, 't1', 'm1', {
      status: 'SENT',
    } as any);
    expect(updated.status).toBe('SENT');
    expect(updated.sentAt).toBeInstanceOf(Date);
  });

  it('rejects illegal transitions including out of terminal states', async () => {
    const service = new DeliveryService();
    for (const from of ['DELIVERED', 'FAILED', 'READ']) {
      const tx = {
        message: {
          findFirst: jest.fn().mockResolvedValue({ id: 'm1', status: from }),
          update: jest.fn(),
        },
      };
      await expect(
        service.recordStatus(tx as any, 't1', 'm1', { status: 'SENT' } as any),
      ).rejects.toBeInstanceOf(CommunicationsInvalidStateError);
      expect(tx.message.update).not.toHaveBeenCalled();
    }
    const queuedTx = {
      message: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm1', status: 'QUEUED' }),
        update: jest.fn(),
      },
    };
    await expect(
      service.recordStatus(queuedTx as any, 't1', 'm1', {
        status: 'DELIVERED',
      } as any),
    ).rejects.toBeInstanceOf(CommunicationsInvalidStateError);
  });

  it('records failures with the provider error', async () => {
    const tx = {
      message: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm1', status: 'SENT' }),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
    };
    const service = new DeliveryService();
    const updated: any = await service.recordStatus(tx as any, 't1', 'm1', {
      status: 'FAILED',
      error: 'provider timeout',
    } as any);
    expect(updated.status).toBe('FAILED');
    expect(updated.error).toBe('provider timeout');
  });
});
