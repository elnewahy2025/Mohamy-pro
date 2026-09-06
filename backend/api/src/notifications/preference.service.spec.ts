import { PreferenceService } from './preference.service';

describe('PreferenceService.channelAllowed', () => {
  const service = new PreferenceService();
  const noon = new Date('2026-05-02T12:00:00Z');

  it('allows by default with no preference row', async () => {
    const tx = {
      notificationPreference: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await expect(
      service.channelAllowed(tx as any, 't1', 'm1', 'IN_APP', noon),
    ).resolves.toEqual({ allowed: true, deferUntil: null });
  });

  it('honors explicit opt-out', async () => {
    const tx = {
      notificationPreference: {
        findFirst: jest.fn().mockResolvedValue({ enabled: false }),
      },
    };

    await expect(
      service.channelAllowed(tx as any, 't1', 'm1', 'IN_APP', noon),
    ).resolves.toEqual({ allowed: false, deferUntil: null });
  });

  it('defers sends inside overnight quiet hours', async () => {
    const tx = {
      notificationPreference: {
        findFirst: jest.fn().mockResolvedValue({
          enabled: true,
          quietStart: '22:00',
          quietEnd: '07:00',
        }),
      },
    };
    const night = new Date('2026-05-02T23:30:00Z');

    const result = await service.channelAllowed(
      tx as any,
      't1',
      'm1',
      'IN_APP',
      night,
    );

    expect(result.allowed).toBe(false);
    expect(result.deferUntil).toBeInstanceOf(Date);
    expect((result.deferUntil as Date).getUTCHours()).toBe(7);
  });

  it('allows outside quiet hours', async () => {
    const tx = {
      notificationPreference: {
        findFirst: jest.fn().mockResolvedValue({
          enabled: true,
          quietStart: '22:00',
          quietEnd: '07:00',
        }),
      },
    };

    await expect(
      service.channelAllowed(tx as any, 't1', 'm1', 'IN_APP', noon),
    ).resolves.toEqual({ allowed: true, deferUntil: null });
  });
});
