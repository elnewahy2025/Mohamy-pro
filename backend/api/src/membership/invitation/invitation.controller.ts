import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CsrfGuard } from '../../auth/session/csrf.guard';
import { SessionGuard } from '../../auth/session/session.guard';
import {
  InvitationAcceptDto,
  InvitationCreateDto,
} from './invitation.dto';
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
  async create(
    @Req() req: Request,
    @Body() dto: InvitationCreateDto,
  ): Promise<InvitationCreateResult> {
    return this.invitations.create(req, dto);
  }

  @Post('accept')
  @UseGuards(SessionGuard, CsrfGuard)
  async accept(
    @Req() req: Request,
    @Body() dto: InvitationAcceptDto,
  ): Promise<InvitationAcceptResult> {
    return this.invitations.accept(req, dto);
  }
}
