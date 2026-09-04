import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { RedisService } from '../infrastructure/redis/redis.service';
import type { TemplateRenderer } from './interfaces/template-renderer.interface';
import type { DocumentConversionProvider } from './interfaces/document-conversion-provider.interface';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { DocumentGenerationStatus } from '@prisma/client';

const TEMPLATE_GENERATION_QUEUE = 'legal-document-generation';

export interface TemplateGenerationJobPayload {
  jobId: string;
  tenantId: string;
  templateVersionId: string;
  caseId?: string;
  clientId?: string;
  formats: string[];
  variables?: Record<string, any>;
}

@Injectable()
export class TemplateGenerationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TemplateGenerationWorker.name);
  private worker?: Worker<TemplateGenerationJobPayload>;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    @Inject('TemplateRenderer') private readonly renderer: TemplateRenderer,
    @Inject('DocumentConversionProvider')
    private readonly converter: DocumentConversionProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker<TemplateGenerationJobPayload>(
      TEMPLATE_GENERATION_QUEUE,
      async (job) => this.process(job),
      {
        connection: this.redis.getClient(),
        concurrency: 5,
        autorun: true,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Template generation job failed: ${error.message}`);
    });

    await this.worker.waitUntilReady();
    this.logger.log(
      `Template generation worker ready on ${TEMPLATE_GENERATION_QUEUE}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = undefined;
  }

  private async process(job: Job<TemplateGenerationJobPayload>): Promise<void> {
    const payload = job.data;

    this.logger.log(
      `Processing document generation job: ${payload.jobId} for tenant ${payload.tenantId}`,
    );

    // Update job status to PROCESSING
    await this.prisma.documentGenerationJob.update({
      where: { id: payload.jobId },
      data: {
        status: DocumentGenerationStatus.PROCESSING,
        startedAt: new Date(),
      },
    });

    try {
      // 1. Resolve variables (mocked here)
      // 2. Fetch template buffer from storage
      // 3. Render DOCX
      const docxResult = await this.renderer.renderDocx({
        templateBuffer: Buffer.from('mock-template'),
        resolvedVariables: payload.variables || {},
      });

      // 4. Convert to PDF if requested
      if (payload.formats.includes('PDF')) {
        await this.converter.convertDocxToPdf({
          buffer: docxResult.buffer,
          sourceMimeType: docxResult.mimeType,
        });
      }

      // 5. Save generated documents to secure storage (mocked here)

      await this.prisma.documentGenerationJob.update({
        where: { id: payload.jobId },
        data: {
          status: DocumentGenerationStatus.SUCCEEDED,
          completedAt: new Date(),
          resultDocumentIds: ['mock-doc-1'],
        },
      });
    } catch (error: any) {
      this.logger.error(`Generation failed: ${error.message}`);
      await this.prisma.documentGenerationJob.update({
        where: { id: payload.jobId },
        data: {
          status: DocumentGenerationStatus.FAILED,
          errorMessageSafe: 'Generation failed due to provider error',
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }
}
