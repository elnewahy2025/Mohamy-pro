import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { QueueService } from '../infrastructure/queue/queue.service';
import { RedisService } from '../infrastructure/redis/redis.service';
import { S3ObjectStorageService } from '../infrastructure/storage/object-storage.service';

export type DependencyState = 'up' | 'down';

export interface DependencyHealth {
  status: DependencyState;
  durationMs: number;
  error?: string;
}

export interface ReadinessResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  checks: Record<string, DependencyHealth>;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queue: QueueService,
    private readonly storage: S3ObjectStorageService,
  ) {}

  getLiveness(): { status: 'ok'; timestamp: string; uptimeSeconds: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const checks = await Promise.all([
      this.runCheck('postgres', () => this.prisma.$queryRaw`SELECT 1`),
      this.runCheck('redis', () => this.redis.ping()),
      this.runCheck('queue', () => this.queue.getCounts()),
      this.runCheck('objectStorage', () => this.storage.healthCheck()),
    ]);
    const checkMap = Object.fromEntries(checks);
    const healthy = Object.values(checkMap).every((check) => check.status === 'up');

    return {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: checkMap,
    };
  }

  private async runCheck(
    name: string,
    operation: () => Promise<unknown>,
  ): Promise<[string, DependencyHealth]> {
    const startedAt = performance.now();
    try {
      await operation();
      return [name, { status: 'up', durationMs: Math.round(performance.now() - startedAt) }];
    } catch (error) {
      return [name, {
        status: 'down',
        durationMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.name : 'UnknownError',
      }];
    }
  }
}
