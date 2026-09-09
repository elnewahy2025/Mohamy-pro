import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CsrfGuard } from '../../auth/session/csrf.guard';
import { SessionGuard } from '../../auth/session/session.guard';
import {
  MembershipAdminDto,
  MembershipPlacementDto,
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
  @ApiOperation({ summary: 'Suspend a tenant membership' })
  @ApiBody({ type: MembershipAdminDto })
  @ApiResponse({ status: 200, description: 'Membership suspended.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing or invalid.',
  })
  @ApiResponse({
    status: 403,
    description: 'Caller lacks the required permission.',
  })
  suspend(
    @Req() req: Request,
    @Body() dto: MembershipAdminDto,
  ): Promise<MembershipAdminResult> {
    return this.admin.suspend(req, dto);
  }

  @Patch('expire')
  @ApiOperation({ summary: 'Expire a tenant membership' })
  @ApiBody({ type: MembershipAdminDto })
  @ApiResponse({ status: 200, description: 'Membership expired.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing or invalid.',
  })
  @ApiResponse({
    status: 403,
    description: 'Caller lacks the required permission.',
  })
  expire(
    @Req() req: Request,
    @Body() dto: MembershipAdminDto,
  ): Promise<MembershipAdminResult> {
    return this.admin.expire(req, dto);
  }

  @Patch('remove')
  @ApiOperation({ summary: 'Remove a tenant membership' })
  @ApiBody({ type: MembershipAdminDto })
  @ApiResponse({ status: 200, description: 'Membership removed.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing or invalid.',
  })
  @ApiResponse({
    status: 403,
    description: 'Caller lacks the required permission.',
  })
  remove(
    @Req() req: Request,
    @Body() dto: MembershipAdminDto,
  ): Promise<MembershipAdminResult> {
    return this.admin.remove(req, dto);
  }

  @Patch('reinstate')
  @ApiOperation({ summary: 'Reinstate a tenant membership' })
  @ApiBody({ type: MembershipReinstateDto })
  @ApiResponse({ status: 200, description: 'Membership reinstated.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing or invalid.',
  })
  @ApiResponse({
    status: 403,
    description: 'Caller lacks the required permission.',
  })
  reinstate(
    @Req() req: Request,
    @Body() dto: MembershipReinstateDto,
  ): Promise<MembershipAdminResult> {
    return this.admin.reinstate(req, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List tenant memberships' })
  @ApiResponse({ status: 200, description: 'Membership list returned.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'Caller lacks the required permission.',
  })
  list(@Req() req: Request) {
    return this.admin.list(req);
  }

  @Patch('placement')
  @ApiOperation({ summary: 'Assign a membership to a branch/department' })
  @ApiBody({ type: MembershipPlacementDto })
  @ApiResponse({ status: 200, description: 'Membership placed.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'Caller lacks the required permission.',
  })
  place(@Req() req: Request, @Body() dto: MembershipPlacementDto) {
    return this.admin.place(req, dto);
  }
}
