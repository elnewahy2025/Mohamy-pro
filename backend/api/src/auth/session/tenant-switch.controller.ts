import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
  async switchTenant(
    @Req() req: Request,
    @Body() dto: TenantSwitchDto,
  ): Promise<TenantSwitchResult> {
    return this.tenantSwitch.switchTenant(req, dto.tenantId);
  }
}
