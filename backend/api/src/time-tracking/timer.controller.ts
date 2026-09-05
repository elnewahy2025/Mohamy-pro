import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { requireTimeTrackingContext } from './time-tracking-auth';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { SessionGuard } from '../auth/session/session.guard';
import { StartTimerDto } from './time-tracking.dto';
import { TimerService } from './timer.service';

@Controller({
  path: 'timers',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class TimerController {
  constructor(private readonly timerService: TimerService) {}

  @Post('start')
  async startTimer(@Body() dto: StartTimerDto, @Req() req: Request) {
    const { tenantId, userId } = requireTimeTrackingContext(req);
    return this.timerService.startTimer(tenantId, userId, dto);
  }

  @Patch(':id/pause')
  async pauseTimer(@Param('id') id: string, @Req() req: Request) {
    const { tenantId, userId } = requireTimeTrackingContext(req);
    return this.timerService.pauseTimer(tenantId, userId, id);
  }

  @Post(':id/stop')
  async stopTimer(@Param('id') id: string, @Req() req: Request) {
    const { tenantId, userId } = requireTimeTrackingContext(req);
    return this.timerService.stopTimerAndCreateEntry(tenantId, userId, id);
  }
}
