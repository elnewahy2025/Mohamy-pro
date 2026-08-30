import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import type { Membership, Tenant } from '@prisma/client';
import { AuditEventService } from '../../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../../audit/audit-constants';
import { getCorrelationId } from '../../common/middleware/correlation-id.middleware';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { hashToken } from './session-crypto';
import { TenantSwitchDeniedError } from './tenant-switch.errors';

export interface CandidateMembership {
  id: string;
  status: Membership['status'];
  activeFrom: Date | null;
  activeUntil: Date | null;
  tenant: Pick<Tenant, 'id' | 'slug' | 'name' | 'status'>;
}

export interface TenantSwitchResult {
  tenantId: string;
  slug: string;
  name: string;
  membershipId: string;
}

const ACTIVE_STATUS = 'ACTIVE';

/**
 * Switches the authenticated user's active session tenant. Membership selection
 * is read under the read-only membership-selection boundary; the session state
 * change and the audit event are written atomically under the target tenant
 * boundary. All denial reasons are collapsed into a single non-enumerating
 * TenantSwitchDeniedError; the specific reason is recorded only in the audit
 * event and server logs.
 */
@Injectable()
export class TenantSwitchService {
  private readonly logger = new Logger(TenantSwitchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
  ) {}

  async switchTenant(
    request: Request,
    tenantId: string,
  ): Promise<TenantSwitchResult> {
    const auth = request.auth;
    if (!auth) {
      throw new TenantSwitchDeniedError('UNAUTHENTICATED');
    }
    const { userId, sessionId, activeTenantId } = auth;
    const correlationId = getCorrelationId(request);

    const membership = await this.loadCandidateMembership(
      userId,
      sessionId,
      tenantId,
    );

    const reason = this.rejectReason(membership);
    if (reason) {
      await this.recordDeniedEvent({
        request,
        correlationId,
        userId,
        sessionId,
        reason,
        tenantId,
        sourceTenantId: activeTenantId,
      });
      throw new TenantSwitchDeniedError(reason);
    }

    const activeMembership = membership as CandidateMembership;
    await this.prisma.withTenantContext(
      {
        tenantId,
        userId,
        membershipId: activeMembership.id,
        operationId: sessionId,
      },
      async (transaction) => {
        await transaction.appSession.update({
          where: { id: sessionId },
          data: {
            activeTenantId: tenantId,
            activeMembershipId: activeMembership.id,
            contextVersion: { increment: 1 },
          },
        });
        await this.audit.write(
          {
            eventType: AUDIT_EVENT_TYPES.TENANT_SWITCH_SUCCEEDED,
            outcome: 'SUCCEEDED',
            actorUserId: userId,
            actorMembershipId: activeMembership.id,
            tenantId,
            targetType: 'tenant',
            targetId: tenantId,
            correlationId,
            ipHash: this.optionalHash(request.ip),
            userAgentHash: this.optionalHash(request.headers['user-agent']),
            metadata: { sourceTenantId: activeTenantId ?? undefined },
          },
          transaction,
        );
      },
    );

    return {
      tenantId: activeMembership.tenant.id,
      slug: activeMembership.tenant.slug,
      name: activeMembership.tenant.name,
      membershipId: activeMembership.id,
    };
  }

  private async loadCandidateMembership(
    userId: string,
    operationId: string,
    tenantId: string,
  ): Promise<CandidateMembership | null> {
    return this.prisma.withMembershipSelectionContext(
      { userId, operationId },
      async (transaction) =>
        transaction.membership.findFirst({
          where: { userId, tenantId },
          select: {
            id: true,
            status: true,
            activeFrom: true,
            activeUntil: true,
            tenant: {
              select: { id: true, slug: true, name: true, status: true },
            },
          },
        }),
    );
  }

  private rejectReason(membership: CandidateMembership | null): string | null {
    if (!membership) return 'NO_MEMBERSHIP';
    if (membership.status !== ACTIVE_STATUS) return 'MEMBERSHIP_NOT_ACTIVE';
    const now = new Date();
    if (membership.activeFrom && membership.activeFrom > now) {
      return 'MEMBERSHIP_NOT_STARTED';
    }
    if (membership.activeUntil && membership.activeUntil <= now) {
      return 'MEMBERSHIP_EXPIRED';
    }
    return null;
  }

  private async recordDeniedEvent(input: {
    request: Request;
    correlationId: string;
    userId: string;
    sessionId: string;
    reason: string;
    tenantId: string;
    sourceTenantId: string | null;
  }): Promise<void> {
    try {
      await this.prisma.withMembershipSelectionContext(
        { userId: input.userId, operationId: input.sessionId },
        async (transaction) => {
          await this.audit.write(
            {
              eventType: AUDIT_EVENT_TYPES.TENANT_SWITCH_DENIED,
              outcome: 'DENIED',
              actorUserId: input.userId,
              actorMembershipId: null,
              tenantId: null,
              targetType: 'tenant',
              targetId: input.tenantId,
              policy: 'MembershipSelection',
              reasonCode: input.reason,
              correlationId: input.correlationId,
              ipHash: this.optionalHash(input.request.ip),
              userAgentHash: this.optionalHash(
                input.request.headers['user-agent'],
              ),
              metadata: {
                sourceTenantId: input.sourceTenantId ?? undefined,
                targetTenantId: input.tenantId,
              },
            },
            transaction,
          );
        },
      );
    } catch (error) {
      this.logger.warn({
        message: 'Failed to record tenant-switch denied audit event',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private optionalHash(value: string | string[] | undefined): string | null {
    if (!value) return null;
    const raw = Array.isArray(value) ? value.join(',') : value;
    return raw.length === 0 ? null : hashToken(raw);
  }
}
