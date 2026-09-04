import { Controller, Post, Body, Req } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { SearchReindexStatus } from '@prisma/client';

@Controller('v1/admin/search')
export class AdminSearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('reindex')
  async reindex(@Body('entityType') entityType: string, @Req() req: any) {
    // Requires privileged admin authorization

    // Look up the active index version for the entity type
    const targetIndex = await this.prisma.searchIndexVersion.findFirst({
      where: { entityType, isPrimary: true },
    });

    if (!targetIndex) {
      return { error: 'Target index version not found' };
    }

    const job = await this.prisma.searchReindexJob.create({
      data: {
        entityType,
        targetIndexId: targetIndex.id,
        status: SearchReindexStatus.PENDING,
      },
    });

    // In a real implementation, this would enqueue a BullMQ job for full reindexing

    return { success: true, jobId: job.id };
  }
}
