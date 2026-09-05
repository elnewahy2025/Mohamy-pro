import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { TimeEntryStatus } from '@prisma/client';
import { CreateTimeEntryDto } from './time-tracking.dto';

@Injectable()
export class TimeEntryService {
  constructor(private readonly prisma: PrismaService) {}

  async createTimeEntry(
    tenantId: string,
    userId: string,
    data: CreateTimeEntryDto,
  ) {
    return this.prisma.timeEntry.create({
      data: {
        ...data,
        tenantId,
        userId,
        status: TimeEntryStatus.DRAFT,
      },
    });
  }

  async getTimeEntries(tenantId: string, userId: string) {
    return this.prisma.timeEntry.findMany({
      where: { tenantId, userId },
      orderBy: { date: 'desc' },
    });
  }

  async submitTimeEntry(tenantId: string, userId: string, entryId: string) {
    return this.prisma.timeEntry.update({
      where: { id: entryId, tenantId, userId },
      data: { status: TimeEntryStatus.SUBMITTED },
    });
  }

  async approveTimeEntry(
    tenantId: string,
    entryId: string,
    approverId: string,
  ) {
    return this.prisma.timeEntry.update({
      where: { id: entryId, tenantId },
      data: { status: TimeEntryStatus.APPROVED, approvedBy: approverId },
    });
  }

  async rejectTimeEntry(tenantId: string, entryId: string, approverId: string) {
    return this.prisma.timeEntry.update({
      where: { id: entryId, tenantId },
      data: { status: TimeEntryStatus.REJECTED, approvedBy: approverId },
    });
  }
}
