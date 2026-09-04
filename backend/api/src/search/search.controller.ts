import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SearchService } from './search.service';
import type { SearchQuery } from './interfaces/search-provider.interface';
import type { SearchAuthorizationContext } from './interfaces/search-authorization-context.interface';

@Controller('v1/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  async search(@Body() query: SearchQuery, @Req() req: any) {
    const authContext = this.buildContext(req);
    return this.searchService.search(query, authContext);
  }

  @Get('suggestions')
  async suggestions(@Query('q') query: string, @Req() req: any) {
    const authContext = this.buildContext(req);
    const results = await this.searchService.suggest(query, authContext);
    return { suggestions: results };
  }

  private buildContext(req: any): SearchAuthorizationContext {
    return {
      tenantId: req.tenantId, // Set by tenant middleware
      userId: req.user?.id,
      roles: req.user?.roles || [],
      // Map other claims as needed
    };
  }
}
