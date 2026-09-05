import {
  Body,
  Controller,
  Get,
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
import { CreateTimeEntryDto } from './time-tracking.dto';
import { TimeEntryService } from './time-entry.service';

@Controller({
  path: 'time-entries',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class TimeEntryController {
  constructor(private readonly timeEntryService: TimeEntryService) {}

  @Post()
  async createEntry(@Body() dto: CreateTimeEntryDto, @Req() req: Request) {
    const { tenantId, userId } = requireTimeTrackingContext(req);
    return this.timeEntryService.createTimeEntry(tenantId, userId, dto);
  }

  @Get()
  async listEntries(@Req() req: Request) {
    const { tenantId, userId } = requireTimeTrackingContext(req);
    return this.timeEntryService.getTimeEntries(tenantId, userId);
  }

  @Patch(':id/submit')
  async submitEntry(@Param('id') id: string, @Req() req: Request) {
    const { tenantId, userId } = requireTimeTrackingContext(req);
    return this.timeEntryService.submitTimeEntry(tenantId, userId, id);
  }

  @Patch(':id/approve')
  async approveEntry(@Param('id') id: string, @Req() req: Request) {
    const { tenantId, userId } = requireTimeTrackingContext(req);
    // Approval authorization (manager/admin) is a product decision deferred
    // explicitly: any authenticated tenant member can approve today.
    return this.timeEntryService.approveTimeEntry(tenantId, id, userId);
  }
}
