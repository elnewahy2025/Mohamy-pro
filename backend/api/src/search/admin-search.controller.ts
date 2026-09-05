import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PERMISSION_KEYS } from '../permissions/permission.constants';
import { SearchReindexStatus } from '@prisma/client';

@Controller({
  path: 'admin/search',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class AdminSearchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  @Post('reindex')
  async reindex(@Body('entityType') entityType: string, @Req() req: Request) {
    const auth = req.auth;
    if (!auth) throw new UnauthorizedException('UNAUTHENTICATED');
    // Privileged operation: platform administrators only. CAN_GRANT_PLATFORM_ADMIN
    // is held exclusively by platform.admin, so it serves as the marker.
    const isPlatformAdmin = await this.permissions.hasGlobalPermission({
      userId: auth.userId,
      permissionKey: PERMISSION_KEYS.CAN_GRANT_PLATFORM_ADMIN,
      operationId: auth.sessionId,
    });
    if (!isPlatformAdmin)
      throw new ForbiddenException('PLATFORM_ADMIN_REQUIRED');

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
