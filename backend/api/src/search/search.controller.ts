import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { SearchService } from './search.service';
import type { SearchQuery } from './interfaces/search-provider.interface';
import type { SearchAuthorizationContext } from './interfaces/search-authorization-context.interface';

function requireAuthContext(request: Request): {
  tenantId: string;
  userId: string;
} {
  const auth = request.auth;
  if (!auth) throw new UnauthorizedException('UNAUTHENTICATED');
  if (!auth.activeTenantId)
    throw new BadRequestException('TENANT_CONTEXT_REQUIRED');
  return { tenantId: auth.activeTenantId, userId: auth.userId };
}

@Controller({
  path: 'search',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  async search(@Body() query: SearchQuery, @Req() req: Request) {
    const authContext = this.buildContext(req);
    return this.searchService.search(query, authContext);
  }

  @Get('suggestions')
  async suggestions(@Query('q') query: string, @Req() req: Request) {
    const authContext = this.buildContext(req);
    const results = await this.searchService.suggest(query, authContext);
    return { suggestions: results };
  }

  private buildContext(req: Request): SearchAuthorizationContext {
    const { tenantId, userId } = requireAuthContext(req);
    return {
      tenantId,
      userId,
      roles: [],
    };
  }
}
