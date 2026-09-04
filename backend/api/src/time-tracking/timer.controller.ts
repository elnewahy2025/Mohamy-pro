import { Controller, Post, Patch, Body, Param, Req } from '@nestjs/common';
import { TimerService } from './timer.service';

@Controller('v1/timers')
export class TimerController {
  constructor(private readonly timerService: TimerService) {}

  @Post('start')
  async startTimer(@Body() data: any, @Req() req: any) {
    return this.timerService.startTimer(
      req.tenantId,
      req.user?.id || 'system',
      data,
    );
  }

  @Patch(':id/pause')
  async pauseTimer(@Param('id') id: string, @Req() req: any) {
    return this.timerService.pauseTimer(req.tenantId, id);
  }

  @Post(':id/stop')
  async stopTimer(@Param('id') id: string, @Req() req: any) {
    return this.timerService.stopTimerAndCreateEntry(req.tenantId, id);
  }
}
