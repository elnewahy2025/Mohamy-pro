import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import {
  APPLICATION_QUEUE_NAME,
  QueueService,
} from '../infrastructure/queue/queue.service';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsSnapshotService {
  constructor(
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async refresh(): Promise<void> {
    const [queueCounts, outboxCounts] = await Promise.all([
      this.queue.getCounts(),
      this.prisma.withDeliveryScope((transaction) =>
        transaction.outboxMessage.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
      ),
    ]);
    this.metrics.setQueueDepth(APPLICATION_QUEUE_NAME, queueCounts);
    this.metrics.setOutboxStateCounts(
      Object.fromEntries(
        outboxCounts.map((item) => [item.status, item._count._all]),
      ),
    );
  }
}
