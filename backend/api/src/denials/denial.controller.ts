import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { AuditEventService } from '../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { getCorrelationId } from '../common/middleware/correlation-id.middleware';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PERMISSION_KEYS } from '../permissions/permission.constants';
import { DenialService } from './denial.service';
import { CreateDenialDto } from './denial.dto';

@Controller({
  path: 'denials',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class DenialController {
  constructor(
    private readonly denials: DenialService,
    private readonly permissions: PermissionsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
  ) {}

  private async authorizeAdmin(request: Request) {
    const auth = request.auth;
    if (!auth) throw new UnauthorizedException('UNAUTHENTICATED');
    if (!auth.activeTenantId)
      throw new BadRequestException('TENANT_CONTEXT_REQUIRED');
    const { membershipId } = await this.permissions.assertTenantPermission({
      request,
      userId: auth.userId,
      tenantId: auth.activeTenantId,
      permissionKey: PERMISSION_KEYS.CAN_MANAGE_ROLES,
      operationId: auth.sessionId,
    });
    return {
      tenantId: auth.activeTenantId,
      userId: auth.userId,
      membershipId,
      sessionId: auth.sessionId,
    };
  }

  @Post()
  async createDenial(@Req() request: Request, @Body() dto: CreateDenialDto) {
    const ctx = await this.authorizeAdmin(request);
    return this.prisma.withTenantContext(
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        membershipId: ctx.membershipId,
        operationId: ctx.sessionId,
      },
      async (tx) => {
        const denial = await this.denials.createDenial(
          tx,
          ctx.tenantId,
          ctx.membershipId,
          dto,
        );
        await this.audit.write(
          {
            eventType: AUDIT_EVENT_TYPES.DENIAL_CREATED,
            outcome: 'SUCCEEDED',
            actorUserId: ctx.userId,
            actorMembershipId: ctx.membershipId,
            tenantId: ctx.tenantId,
            targetType: 'denial',
            targetId: denial.id,
            policy: PERMISSION_KEYS.CAN_MANAGE_ROLES,
            correlationId: getCorrelationId(request),
            metadata: { permissionKey: dto.permissionKey },
          },
          tx,
        );
        return denial;
      },
    );
  }

  @Post(':id/revoke')
  async revokeDenial(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.authorizeAdmin(request);
    return this.prisma.withTenantContext(
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        membershipId: ctx.membershipId,
        operationId: ctx.sessionId,
      },
      async (tx) => {
        const denial = await this.denials.revokeDenial(tx, ctx.tenantId, id);
        await this.audit.write(
          {
            eventType: AUDIT_EVENT_TYPES.DENIAL_REVOKED,
            outcome: 'SUCCEEDED',
            actorUserId: ctx.userId,
            actorMembershipId: ctx.membershipId,
            tenantId: ctx.tenantId,
            targetType: 'denial',
            targetId: denial.id,
            policy: PERMISSION_KEYS.CAN_MANAGE_ROLES,
            correlationId: getCorrelationId(request),
            metadata: { denialId: denial.id },
          },
          tx,
        );
        return denial;
      },
    );
  }

  @Get()
  async listDenials(
    @Req() request: Request,
    @Query('subjectUserId') subjectUserId?: string,
    @Query('permissionKey') permissionKey?: string,
  ) {
    const ctx = await this.authorizeAdmin(request);
    return this.prisma.withTenantContext(
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        membershipId: ctx.membershipId,
        operationId: ctx.sessionId,
      },
      (tx) =>
        this.denials.listDenials(tx, ctx.tenantId, {
          subjectUserId,
          permissionKey,
        }),
    );
  }
}
