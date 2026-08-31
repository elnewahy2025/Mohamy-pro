import { Body, Controller, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CsrfGuard } from '../../auth/session/csrf.guard';
import { SessionGuard } from '../../auth/session/session.guard';
import {
  MembershipAdminDto,
  MembershipReinstateDto,
} from './membership-admin.dto';
import {
  MembershipAdminService,
  type MembershipAdminResult,
} from './membership-admin.service';

@ApiTags('membership')
@Controller('membership/members')
@UseGuards(SessionGuard, CsrfGuard)
export class MembershipAdminController {
  constructor(private readonly admin: MembershipAdminService) {}

  @Patch('suspend')
  suspend(
    @Req() req: Request,
    @Body() dto: MembershipAdminDto,
  ): Promise<MembershipAdminResult> {
    return this.admin.suspend(req, dto);
  }

  @Patch('expire')
  expire(
    @Req() req: Request,
    @Body() dto: MembershipAdminDto,
  ): Promise<MembershipAdminResult> {
    return this.admin.expire(req, dto);
  }

  @Patch('remove')
  remove(
    @Req() req: Request,
    @Body() dto: MembershipAdminDto,
  ): Promise<MembershipAdminResult> {
    return this.admin.remove(req, dto);
  }

  @Patch('reinstate')
  reinstate(
    @Req() req: Request,
    @Body() dto: MembershipReinstateDto,
  ): Promise<MembershipAdminResult> {
    return this.admin.reinstate(req, dto);
  }
}
