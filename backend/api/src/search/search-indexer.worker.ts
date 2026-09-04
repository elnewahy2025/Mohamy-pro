import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { RedisService } from '../infrastructure/redis/redis.service';
import type { SearchProvider } from './interfaces/search-provider.interface';

const SEARCH_INDEX_QUEUE = 'search.index';

export interface SearchIndexJobPayload {
  tenantId: string;
  entityType: string;
  entityId: string;
  action: 'UPSERT' | 'DELETE';
  documentData?: any;
}

@Injectable()
export class SearchIndexerWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchIndexerWorker.name);
  private worker?: Worker<SearchIndexJobPayload>;

  constructor(
    private readonly redis: RedisService,
    @Inject('SearchProvider') private readonly searchProvider: SearchProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker<SearchIndexJobPayload>(
      SEARCH_INDEX_QUEUE,
      async (job) => this.process(job),
      {
        connection: this.redis.getClient(),
        concurrency: 5,
        autorun: true,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Search index job failed: ${error.message}`);
    });

    await this.worker.waitUntilReady();
    this.logger.log(`Search index worker ready on ${SEARCH_INDEX_QUEUE}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = undefined;
  }

  private async process(job: Job<SearchIndexJobPayload>): Promise<void> {
    const { tenantId, entityType, entityId, action, documentData } = job.data;

    // Derived target index mapping
    const indexName = `search-${entityType.toLowerCase()}s-current`;

    this.logger.log(
      `Processing search index job: ${action} on ${entityType}:${entityId}`,
    );

    if (action === 'UPSERT' && documentData) {
      await this.searchProvider.indexDocument(indexName, entityId, {
        ...documentData,
        tenantId,
        entityType,
      });
    } else if (action === 'DELETE') {
      await this.searchProvider.deleteDocument(indexName, entityId);
    }
  }
}
