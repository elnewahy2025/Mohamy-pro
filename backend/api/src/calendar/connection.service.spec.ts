import { ConnectionService } from './connection.service';
import { CalendarNotFoundError } from './calendar.errors';

describe('ConnectionService', () => {
  it('creates connections DISABLED by default', async () => {
    const tx = {
      calendarConnection: {
        create: jest.fn().mockImplementation(({ data }: any) => data),
      },
    };
    const service = new ConnectionService();

    const created: any = await service.create(tx as any, 't1', {
      provider: 'GOOGLE',
      accountRef: 'cal@example.com',
    } as any);

    expect(created.status).toBe('DISABLED');
    expect(created.tenantId).toBe('t1');
  });

  it('toggles enablement tenant-scoped', async () => {
    const tx = {
      calendarConnection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'c1' }),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
    };
    const service = new ConnectionService();

    const enabled: any = await service.setEnabled(tx as any, 't1', 'c1', true);
    expect(enabled.status).toBe('ACTIVE');
    expect(tx.calendarConnection.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1', tenantId: 't1' },
    });

    (tx.calendarConnection.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.setEnabled(tx as any, 'other', 'c1', true),
    ).rejects.toBeInstanceOf(CalendarNotFoundError);
  });
});
