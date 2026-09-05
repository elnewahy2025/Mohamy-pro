import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { requireTimeTrackingContext } from './time-tracking-auth';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { SessionGuard } from '../auth/session/session.guard';
import { RateService } from './rate.service';
import { CreateRateDto } from './time-tracking.dto';

@Controller({
  path: 'rates',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class RateController {
  constructor(private readonly rateService: RateService) {}

  @Post()
  async createRate(@Body() dto: CreateRateDto, @Req() req: Request) {
    const { tenantId, userId } = requireTimeTrackingContext(req);
    return this.rateService.createRate(tenantId, userId, dto);
  }

  @Get()
  async listRates(@Req() req: Request) {
    const { tenantId } = requireTimeTrackingContext(req);
    return this.rateService.getRates(tenantId);
  }
}
