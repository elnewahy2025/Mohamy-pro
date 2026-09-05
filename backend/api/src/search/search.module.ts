import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchAuthorizationScopeBuilder } from './search-authorization-scope.builder';
import { SearchIndexerWorker } from './search-indexer.worker';
import { SearchController } from './search.controller';
import { AdminSearchController } from './admin-search.controller';
import { OpenSearchAdapter } from './adapters/opensearch.adapter';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [DatabaseModule, AuthModule, PermissionsModule],
  controllers: [SearchController, AdminSearchController],
  providers: [
    SearchService,
    SearchAuthorizationScopeBuilder,
    SearchIndexerWorker,
    { provide: 'SearchProvider', useClass: OpenSearchAdapter },
  ],
  exports: [SearchService],
})
export class SearchModule {}
