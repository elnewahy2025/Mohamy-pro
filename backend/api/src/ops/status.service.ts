import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HealthService } from '../health/health.service';
import { BackupPolicyService } from './policy.service';
import { DrillService } from './drill.service';

export interface OpsStatus {
  health: Record<string, unknown>;
  outbox: { mine: Record<string, number>; globalPool: Record<string, number> };
  backupPolicy: { configured: boolean; enabled: boolean | null };
  latestDrill: {
    id: string;
    name: string;
    status: string;
    finishedAt: string | null;
  } | null;
}

@Injectable()
export class OpsStatusService {
  private healthCache: { at: number; value: unknown } | null = null;
  private static readonly HEALTH_TTL_MS = 30_000;

  constructor(
    private readonly health: HealthService,
    private readonly policies: BackupPolicyService,
    private readonly drills: DrillService,
  ) {}

  private async cachedReadiness(): Promise<unknown> {
    const now = Date.now();
    if (
      this.healthCache &&
      now - this.healthCache.at < OpsStatusService.HEALTH_TTL_MS
    ) {
      return this.healthCache.value;
    }
    const value = await this.health.getReadiness();
    this.healthCache = { at: now, value };
    return value;
  }

  async status(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<OpsStatus> {
    const [readiness, mine, globalPool, policy, drill] = await Promise.all([
      this.cachedReadiness(),
      tx.outboxMessage.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
      tx.outboxMessage.groupBy({
        by: ['status'],
        where: { tenantId: null },
        _count: { _all: true },
      }),
      this.policies.get(tx, tenantId),
      this.drills.latest(tx, tenantId),
    ]);
    const counts = (
      groups: Array<{ status: string; _count: { _all: number } }>,
    ): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const group of groups) out[group.status] = group._count._all;
      return out;
    };
    return {
      health: readiness as unknown as Record<string, unknown>,
      outbox: { mine: counts(mine), globalPool: counts(globalPool) },
      backupPolicy: {
        configured: policy !== null,
        enabled: policy?.enabled ?? null,
      },
      latestDrill: drill
        ? {
            id: drill.id,
            name: drill.name,
            status: drill.status,
            finishedAt: drill.finishedAt?.toISOString() ?? null,
          }
        : null,
    };
  }
}
