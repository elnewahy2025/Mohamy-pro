import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type {
  SearchProvider,
  SearchQuery,
  SearchResult,
  SearchAuthorizationContext,
} from './interfaces/search-provider.interface';
import { SearchAuthorizationScopeBuilder } from './search-authorization-scope.builder';

@Injectable()
export class SearchService {
  constructor(
    @Inject('SearchProvider') private readonly searchProvider: SearchProvider,
    private readonly scopeBuilder: SearchAuthorizationScopeBuilder,
  ) {}

  async search(
    query: SearchQuery,
    context: SearchAuthorizationContext,
  ): Promise<SearchResult> {
    this.validateQuery(query);

    // Convert generic context into concrete constraints if provider needs it natively,
    // though the provider interface accepts the context directly to construct its own DSL.
    // The ScopeBuilder is available for specialized logic.
    const strictScope = this.scopeBuilder.buildScope(context);

    return this.searchProvider.search(query, context);
  }

  async suggest(
    query: string,
    context: SearchAuthorizationContext,
  ): Promise<string[]> {
    if (!query || query.length < 2) {
      return [];
    }
    return this.searchProvider.suggest(query, context);
  }

  private validateQuery(query: SearchQuery) {
    if (query.pageSize && query.pageSize > 100) {
      throw new BadRequestException('Maximum page size is 100');
    }
  }
}
