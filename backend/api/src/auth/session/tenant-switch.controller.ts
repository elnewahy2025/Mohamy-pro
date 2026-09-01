import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CsrfGuard } from './csrf.guard';
import { SessionGuard } from './session.guard';
import { TenantSwitchDto } from './tenant-switch.dto';
import {
  TenantSwitchService,
  type TenantSwitchResult,
} from './tenant-switch.service';

@ApiTags('session')
@Controller('session')
export class TenantSwitchController {
  constructor(private readonly tenantSwitch: TenantSwitchService) {}

  @Post('tenant-switch')
  @UseGuards(SessionGuard, CsrfGuard)
  @ApiOperation({ summary: 'Switch the active session tenant' })
  @ApiBody({ type: TenantSwitchDto })
  @ApiResponse({
    status: 200,
    description: 'Active tenant context established.',
  })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing or invalid.',
  })
  @ApiResponse({ status: 403, description: 'Tenant-switch is denied.' })
  async switchTenant(
    @Req() req: Request,
    @Body() dto: TenantSwitchDto,
  ): Promise<TenantSwitchResult> {
    return this.tenantSwitch.switchTenant(req, dto.tenantId);
  }
}
