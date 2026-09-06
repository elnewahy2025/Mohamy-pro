import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SetPreferenceDto } from './notification.dto';

@Injectable()
export class PreferenceService {
  async set(
    tx: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
    dto: SetPreferenceDto,
  ) {
    return tx.notificationPreference.upsert({
      where: {
        tenantId_membershipId_channel: {
          tenantId,
          membershipId,
          channel: dto.channel,
        },
      },
      create: {
        tenantId,
        membershipId,
        channel: dto.channel,
        enabled: dto.enabled,
        quietStart: dto.quietStart,
        quietEnd: dto.quietEnd,
      },
      update: {
        enabled: dto.enabled,
        quietStart: dto.quietStart,
        quietEnd: dto.quietEnd,
      },
    });
  }

  async listMine(
    tx: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
  ) {
    return tx.notificationPreference.findMany({
      where: { tenantId, membershipId },
      orderBy: { channel: 'asc' },
    });
  }

  async channelAllowed(
    tx: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
    channel: string,
    now: Date,
  ): Promise<{ allowed: boolean; deferUntil: Date | null }> {
    const preference = await tx.notificationPreference.findFirst({
      where: { tenantId, membershipId, channel: channel as never },
    });
    if (preference && !preference.enabled) {
      return { allowed: false, deferUntil: null };
    }
    if (preference?.quietStart && preference?.quietEnd) {
      const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      const [startHour, startMinute] = preference.quietStart
        .split(':')
        .map(Number);
      const [endHour, endMinute] = preference.quietEnd.split(':').map(Number);
      const start = startHour * 60 + startMinute;
      const end = endHour * 60 + endMinute;
      const inQuiet =
        start <= end
          ? nowMinutes >= start && nowMinutes < end
          : nowMinutes >= start || nowMinutes < end;
      if (inQuiet) {
        const deferred = new Date(now);
        deferred.setUTCHours(endHour, endMinute, 0, 0);
        if (deferred <= now) deferred.setUTCDate(deferred.getUTCDate() + 1);
        return { allowed: false, deferUntil: deferred };
      }
    }
    return { allowed: true, deferUntil: null };
  }
}
