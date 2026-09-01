import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { SessionGuard } from '../auth/session/session.guard';
import { BootstrapDto } from './bootstrap.dto';
import { BootstrapService, type BootstrapResult } from './bootstrap.service';

@ApiTags('bootstrap')
@Controller('bootstrap')
export class BootstrapController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  @Post()
  @UseGuards(SessionGuard, CsrfGuard)
  @ApiOperation({
    summary: 'Bootstrap the first platform/tenant administrator',
  })
  @ApiBody({ type: BootstrapDto })
  @ApiResponse({
    status: 201,
    description: 'Tenant and bootstrap administrator created.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bootstrap already performed or secret invalid.',
  })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing or invalid.',
  })
  async bootstrap(
    @Req() req: Request,
    @Body() dto: BootstrapDto,
  ): Promise<BootstrapResult> {
    return this.bootstrapService.bootstrap(req, dto.secret);
  }
}
