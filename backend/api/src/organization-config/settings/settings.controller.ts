import { Body, Controller, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CsrfGuard } from '../../auth/session/csrf.guard';
import { SessionGuard } from '../../auth/session/session.guard';
import {
  OrganizationSettingsService,
  type SetOrganizationSettingResult,
} from './settings.service';
import { SetOrganizationSettingValueDto } from './settings.dto';

@ApiTags('organization-config')
@Controller('organization-config/settings')
@UseGuards(SessionGuard, CsrfGuard)
export class OrganizationSettingsController {
  constructor(private readonly settings: OrganizationSettingsService) {}

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
