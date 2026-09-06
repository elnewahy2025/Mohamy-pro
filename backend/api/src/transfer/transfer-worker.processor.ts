import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { randomUUID } from 'crypto';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { RedisService } from '../infrastructure/redis/redis.service';
import { ImportService, TRANSFER_IMPORT_QUEUE } from './import.service';

export interface TransferImportJobPayload {
  tenantId: string;
  jobId: string;
  correlationId?: string;
}

@Injectable()
export class TransferWorkerProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TransferWorkerProcessor.name);
  private worker?: Worker<TransferImportJobPayload>;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly imports: ImportService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker<TransferImportJobPayload>(
      TRANSFER_IMPORT_QUEUE,
      async (job) => this.process(job),
      {
        connection: this.redis.getClient(),
        concurrency: 2,
        autorun: true,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(`Completed import job ${job.id ?? job.name}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Import job failed: ${error.message}`);
    });

    await this.worker.waitUntilReady();
    this.logger.log(`Transfer worker is ready on ${TRANSFER_IMPORT_QUEUE}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = undefined;
  }

  private async process(job: Job<TransferImportJobPayload>): Promise<void> {
    if (job.name !== 'import.run') return;
    const { tenantId, jobId, correlationId } = job.data;
    this.logger.log(
      `[Correlation: ${correlationId}] Running import job ${jobId} in tenant ${tenantId}`,
    );
    await this.prisma.withWorkerTenantContext(
      tenantId,
      correlationId ?? randomUUID(),
      async (tx) => {
        await this.imports.runJob(tx as never, tenantId, jobId);
      },
    );
  }
}
