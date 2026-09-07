import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { ProvisionUserDto } from './provisioning.dto';
import {
  ProvisioningService,
  type ProvisionUserResult,
} from './provisioning.service';

@Controller('identity/users')
export class ProvisioningController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @Post()
  @UseGuards(SessionGuard, CsrfGuard)
  async provisionUser(
    @Req() request: Request,
    @Body() dto: ProvisionUserDto,
  ): Promise<ProvisionUserResult> {
    return this.provisioning.provision(request, dto);
  }
}
