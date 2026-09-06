import { RuleService } from './rule.service';
import { NotificationInvalidStateError } from './notification.errors';

describe('RuleService', () => {
  it('rejects unwired channels at creation (fail-closed)', async () => {
    const tx = { notificationRule: { create: jest.fn() } };
    const service = new RuleService();

    await expect(
      service.create(tx as any, 't1', {
        eventType: 'INVOICE_ISSUED',
        channels: ['EMAIL'],
      } as any),
    ).rejects.toBeInstanceOf(NotificationInvalidStateError);
    expect(tx.notificationRule.create).not.toHaveBeenCalled();
  });

  it('validates escalation targets', async () => {
    const tx = {
      notificationRule: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'r1',
          ...data,
        })),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new RuleService();

    await expect(
      service.create(tx as any, 't1', {
        eventType: 'INVOICE_ISSUED',
        channels: ['IN_APP'],
        escalateToMembershipId: 'ghost',
      } as any),
    ).rejects.toBeInstanceOf(NotificationInvalidStateError);

    (tx.membership.findFirst as jest.Mock).mockResolvedValue({
      id: 'm9',
      status: 'ACTIVE',
    });
    const created: any = await service.create(tx as any, 't1', {
      eventType: 'INVOICE_ISSUED',
      channels: ['IN_APP'],
      escalateToMembershipId: 'm9',
    } as any);
    expect(created.id).toBe('r1');
  });
});
