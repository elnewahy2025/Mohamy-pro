import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { OcrProcessingService } from './ocr-processing.service';
import { OcrUnavailableError } from './ocr-unavailable.error';

const OCR_QUEUE_NAME = 'ocr.document';

export interface OcrJobPayload {
  processingId: string;
  tenantId: string;
  documentId: string;
  documentVersionId: string;
  correlationId?: string;
}

@Injectable()
export class OcrWorkerProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OcrWorkerProcessor.name);
  private worker?: Worker<OcrJobPayload>;

  constructor(
    private readonly redis: RedisService,
    private readonly ocrProcessingService: OcrProcessingService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker<OcrJobPayload>(
      OCR_QUEUE_NAME,
      async (job) => this.process(job),
      {
        connection: this.redis.getClient(),
        concurrency: 5,
        autorun: true,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(`Completed OCR job ${job.id ?? job.name}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`OCR job failed: ${error.message}`);
    });

    await this.worker.waitUntilReady();
    this.logger.log(`OCR worker is ready on ${OCR_QUEUE_NAME}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = undefined;
  }

  private async process(job: Job<OcrJobPayload>): Promise<void> {
    if (
      job.name === 'ocr.document.process' ||
      job.name === 'ocr.document.reprocess'
    ) {
      const { processingId, tenantId, correlationId } = job.data;
      this.logger.log(
        `[Correlation: ${correlationId}] Processing OCR job for ${processingId} in tenant ${tenantId}`,
      );

      // The MinIO source-stream reader is not implemented yet (Phase 17
      // scaffold). Fail closed rather than persisting fabricated pages.
      throw new OcrUnavailableError(
        'document source-stream reader is not implemented',
      );
    }
  }
}
