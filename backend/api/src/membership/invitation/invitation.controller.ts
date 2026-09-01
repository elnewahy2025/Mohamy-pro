import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CsrfGuard } from '../../auth/session/csrf.guard';
import { SessionGuard } from '../../auth/session/session.guard';
import { InvitationAcceptDto, InvitationCreateDto } from './invitation.dto';
import {
  InvitationService,
  type InvitationAcceptResult,
  type InvitationCreateResult,
} from './invitation.service';

@ApiTags('membership')
@Controller('membership/invitations')
export class InvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Post()
  @UseGuards(SessionGuard, CsrfGuard)
  @ApiOperation({ summary: 'Create a membership invitation' })
  @ApiBody({ type: InvitationCreateDto })
  @ApiResponse({ status: 201, description: 'Invitation created.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing or invalid.',
  })
  @ApiResponse({
    status: 403,
    description: 'Caller lacks the required permission.',
  })
  async create(
    @Req() req: Request,
    @Body() dto: InvitationCreateDto,
  ): Promise<InvitationCreateResult> {
    return this.invitations.create(req, dto);
  }

  @Post('accept')
  @UseGuards(SessionGuard, CsrfGuard)
  @ApiOperation({ summary: 'Accept a membership invitation' })
  @ApiBody({ type: InvitationAcceptDto })
  @ApiResponse({ status: 200, description: 'Invitation accepted.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing or invalid.',
  })
  @ApiResponse({
    status: 409,
    description: 'Invitation is invalid or expired.',
  })
  async accept(
    @Req() req: Request,
    @Body() dto: InvitationAcceptDto,
  ): Promise<InvitationAcceptResult> {
    return this.invitations.accept(req, dto);
  }
}
