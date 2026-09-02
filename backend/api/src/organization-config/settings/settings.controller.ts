import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CsrfGuard } from '../../auth/session/csrf.guard';
import { SessionGuard } from '../../auth/session/session.guard';
import type { Paginated } from '../../common/api/envelope';
import {
  OrganizationSettingsService,
  type GetOrganizationSettingResult,
  type ListOrganizationSettingResult,
  type SetOrganizationSettingResult,
} from './settings.service';
import {
  ListOrganizationSettingQueryDto,
  SetOrganizationSettingValueDto,
} from './settings.dto';

@ApiTags('organization-config')
@Controller('organization-config/settings')
@UseGuards(SessionGuard, CsrfGuard)
export class OrganizationSettingsController {
  constructor(private readonly settings: OrganizationSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'List tenant organization settings (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Paginated settings list.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  list(
    @Req() req: Request,
    @Query() dto: ListOrganizationSettingQueryDto,
  ): Promise<ListOrganizationSettingResult> {
    return this.settings.list(req, {
      page: dto.page ?? 1,
      limit: dto.limit ?? 20,
    });
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get a single tenant organization setting by key' })
  @ApiParam({ name: 'key', description: 'Namespaced setting key.' })
  @ApiResponse({ status: 200, description: 'Setting value returned.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  get(
    @Req() req: Request,
    @Param('key') key: string,
  ): Promise<GetOrganizationSettingResult | null> {
    return this.settings.get(req, key);
  }

  @Put(':key')
  @ApiOperation({
    summary: 'Set a tenant-scoped organization setting (create or update)',
  })
  @ApiBody({ type: SetOrganizationSettingValueDto })
  @ApiResponse({ status: 200, description: 'Setting persisted.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  set(
    @Req() req: Request,
    @Param('key') key: string,
    @Body() dto: SetOrganizationSettingValueDto,
  ): Promise<SetOrganizationSettingResult> {
    return this.settings.set(req, { key, value: dto.value });
  }
}
