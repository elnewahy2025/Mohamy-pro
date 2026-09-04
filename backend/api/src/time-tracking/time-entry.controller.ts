import { Controller, Post, Get, Patch, Body, Param, Req } from '@nestjs/common';
import { TimeEntryService } from './time-entry.service';

@Controller('v1/time-entries')
export class TimeEntryController {
  constructor(private readonly timeEntryService: TimeEntryService) {}

  @Post()
  async createEntry(@Body() data: any, @Req() req: any) {
    return this.timeEntryService.createTimeEntry(
      req.tenantId,
      req.user?.id || 'system',
      data,
    );
  }

  @Get()
  async listEntries(@Req() req: any) {
    return this.timeEntryService.getTimeEntries(
      req.tenantId,
      req.user?.id || 'system',
    );
  }

  @Patch(':id/submit')
  async submitEntry(@Param('id') id: string, @Req() req: any) {
    return this.timeEntryService.submitTimeEntry(req.tenantId, id);
  }

  @Patch(':id/approve')
  async approveEntry(@Param('id') id: string, @Req() req: any) {
    // Requires authorization
    return this.timeEntryService.approveTimeEntry(
      req.tenantId,
      id,
      req.user?.id || 'system',
    );
  }
}
