import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
  async bootstrap(
    @Req() req: Request,
    @Body() dto: BootstrapDto,
  ): Promise<BootstrapResult> {
    return this.bootstrapService.bootstrap(req, dto.secret);
  }
}
