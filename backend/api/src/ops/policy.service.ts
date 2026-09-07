import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OpsInvalidStateError } from './ops.errors';
import type { SetBackupPolicyDto } from './ops.dto';

const FIELD_RANGES: Array<[number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

function isValidCron(value: string): boolean {
  const fields = value.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((field, index) => {
    if (field === '*') return true;
    const [min, max] = FIELD_RANGES[index];
    return field
      .split(',')
      .every(
        (part) =>
          /^\d+$/.test(part) && Number(part) >= min && Number(part) <= max,
      );
  });
}

@Injectable()
export class BackupPolicyService {
  async set(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    dto: SetBackupPolicyDto,
  ) {
    if (!isValidCron(dto.scheduleCron)) {
      throw new OpsInvalidStateError(
        'scheduleCron must be a valid 5-field cron with in-range values',
      );
    }
    return tx.backupPolicy.upsert({
      where: { tenantId },
      create: {
        tenantId,
        rpoHours: dto.rpoHours,
        rtoHours: dto.rtoHours,
        scheduleCron: dto.scheduleCron,
        retentionDays: dto.retentionDays,
        enabled: dto.enabled ?? true,
        createdBy: userId,
      },
      update: {
        rpoHours: dto.rpoHours,
        rtoHours: dto.rtoHours,
        scheduleCron: dto.scheduleCron,
        retentionDays: dto.retentionDays,
        enabled: dto.enabled ?? true,
      },
    });
  }

  async get(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.backupPolicy.findFirst({ where: { tenantId } });
  }
}
