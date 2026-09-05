import { Injectable, Logger } from '@nestjs/common';
import {
  SearchProvider,
  SearchQuery,
  SearchResult,
  SearchAuthorizationContext,
} from '../interfaces/search-provider.interface';
import { SearchUnavailableError } from '../search-unavailable.error';

@Injectable()
export class OpenSearchAdapter implements SearchProvider {
  private readonly logger = new Logger(OpenSearchAdapter.name);

  // The OpenSearch client is not injected yet (Phase 18 scaffold).
  // Every method fails closed rather than returning fabricated results.

  async search(
    query: SearchQuery,
    authContext: SearchAuthorizationContext,
  ): Promise<SearchResult> {
    void query;
    this.logger.error(
      `Search called without a provider for tenant: ${authContext.tenantId}`,
    );
    throw new SearchUnavailableError();
  }

  async suggest(
    query: string,
    authContext: SearchAuthorizationContext,
  ): Promise<string[]> {
    void query;
    this.logger.error(
      `Suggest called without a provider for tenant: ${authContext.tenantId}`,
    );
    throw new SearchUnavailableError();
  }

  async indexDocument(
    indexName: string,
    entityId: string,
    document: any,
  ): Promise<void> {
    void document;
    this.logger.error(
      `Index write for ${entityId} into ${indexName} dropped: no provider`,
    );
    throw new SearchUnavailableError();
  }

  async deleteDocument(indexName: string, entityId: string): Promise<void> {
    this.logger.error(
      `Index delete for ${entityId} from ${indexName} dropped: no provider`,
    );
    throw new SearchUnavailableError();
  }
}
