import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { TemplateService } from './template.service';

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
  path: 'templates',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post()
  async createTemplate(@Body() data: any, @Req() req: Request) {
    const { tenantId, userId } = requireAuthContext(req);
    return this.templateService.createTemplate(tenantId, userId, data);
  }

  @Get()
  async listTemplates(@Req() req: Request) {
    const { tenantId } = requireAuthContext(req);
    return this.templateService.getTemplates(tenantId);
  }

  @Get(':id')
  async getTemplate(@Param('id') id: string, @Req() req: Request) {
    const { tenantId } = requireAuthContext(req);
    return this.templateService.getTemplateById(tenantId, id);
  }
}
