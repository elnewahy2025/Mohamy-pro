import type { SearchAuthorizationContext } from './search-authorization-context.interface';
export type { SearchAuthorizationContext };

export interface SearchQuery {
  query: string;
  entityTypes?: string[];
  filters?: Record<string, any>;
  sort?: { field: string; direction: 'asc' | 'desc' };
  page?: number;
  pageSize?: number;
  fields?: string[];
}

export interface SearchResultItem {
  entityType: string;
  entityId: string;
  title: string;
  highlights?: Record<string, string[]>;
  metadata?: Record<string, any>;
}

export interface SearchResult {
  items: SearchResultItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
  queryId?: string;
}

export interface SearchProvider {
  /**
   * Executes a search query using the provided authorization scope to ensure
   * results are securely filtered at the query layer.
   */
  search(
    query: SearchQuery,
    authContext: SearchAuthorizationContext,
  ): Promise<SearchResult>;

  /**
   * Retrieves search suggestions safely scoped to the user's authorization.
   */
  suggest(
    query: string,
    authContext: SearchAuthorizationContext,
  ): Promise<string[]>;

  /**
   * Indexes a document into the search index.
   */
  indexDocument(
    indexName: string,
    entityId: string,
    document: any,
  ): Promise<void>;

  /**
   * Removes a document from the search index.
   */
  deleteDocument(indexName: string, entityId: string): Promise<void>;
}
