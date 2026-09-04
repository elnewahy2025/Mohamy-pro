import { Injectable } from '@nestjs/common';
import { SearchAuthorizationContext } from './interfaces/search-authorization-context.interface';

@Injectable()
export class SearchAuthorizationScopeBuilder {
  /**
   * Transforms a generic auth context into explicit constraints for the search provider.
   * In a real implementation, this translates role/permissions into OpenSearch filters.
   */
  buildScope(context: SearchAuthorizationContext): Record<string, any> {
    const scope: Record<string, any> = {
      tenantId: context.tenantId,
    };

    if (context.organizationScope) {
      scope.organizationId = context.organizationScope;
    }

    if (context.explicitDenials && context.explicitDenials.length > 0) {
      scope.mustNotMatch = context.explicitDenials;
    }

    return scope;
  }
}
