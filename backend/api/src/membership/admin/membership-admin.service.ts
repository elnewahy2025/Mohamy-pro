import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { MembershipStatus, type Membership } from '@prisma/client';
import { AbuseControlService } from '../../abuse/abuse-control.service';
import { MFA_RATE_LIMITED } from '../../abuse/abuse-control.constants';
import { AbuseLimitReachedError } from '../../abuse/abuse-control.errors';
import { AuditEventService } from '../../audit/audit-event.service';
import {
  AUDIT_EVENT_TYPES,
  type AuditEventType,
} from '../../audit/audit-constants';
import { MfaAssuranceService } from '../../auth/mfa/mfa-assurance.service';
import { MfaStepUpRequiredError } from '../../auth/mfa/mfa.errors';
import { hashToken } from '../../auth/session/session-crypto';
import { getCorrelationId } from '../../common/middleware/correlation-id.middleware';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PERMISSION_KEYS } from '../../permissions/permission.constants';
import { PermissionsService } from '../../permissions/permissions.service';
import { MembershipAdminDeniedError } from './membership-admin.errors';
import type {
  MembershipAdminDto,
  MembershipReinstateDto,
} from './membership-admin.dto';

export interface MembershipAdminResult {
  membershipId: string;
  tenantId: string;
  status: MembershipStatus;
}

const ACTIVE = MembershipStatus.ACTIVE;

/**
 * Staff-sensitive membership administration within the active tenant. Every
 * operation requires recent MFA and the CanManageMembership policy, then
 * performs a guarded lifecycle transition and records an audit event. All
 * outcomes are non-enumerating.
 */
@Injectable()
export class MembershipAdminService {
  private readonly logger = new Logger(MembershipAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
    private readonly permissions: PermissionsService,
    private readonly mfa: MfaAssuranceService,
    private readonly abuse: AbuseControlService,
  ) {}

  async suspend(
    request: Request,
    dto: MembershipAdminDto,
  ): Promise<MembershipAdminResult> {
    return this.transition(request, dto, {
      target: MembershipStatus.SUSPENDED,
      allowedFrom: [ACTIVE],
      auditEvent: AUDIT_EVENT_TYPES.MEMBERSHIP_SUSPENDED,
      apply(request, membership, reason) {
        void request;
        void reason;
        return {
          status: MembershipStatus.SUSPENDED,
          suspendedAt: new Date(),
        };
      },
    });
  }

  async expire(
    request: Request,
    dto: MembershipAdminDto,
  ): Promise<MembershipAdminResult> {
    return this.transition(request, dto, {
      target: MembershipStatus.EXPIRED,
      allowedFrom: [
        ACTIVE,
        MembershipStatus.SUSPENDED,
        MembershipStatus.INVITED,
      ],
      auditEvent: AUDIT_EVENT_TYPES.MEMBERSHIP_EXPIRED,
      apply(request, membership, reason) {
        void request;
        void reason;
        const activeUntil = dto.activeUntil
          ? new Date(dto.activeUntil)
          : (membership.activeUntil ?? new Date());
        return { status: MembershipStatus.EXPIRED, activeUntil };
      },
    });
  }

  async remove(
    request: Request,
    dto: MembershipAdminDto,
  ): Promise<MembershipAdminResult> {
    return this.transition(request, dto, {
      target: MembershipStatus.REMOVED,
      allowedFrom: Object.values(MembershipStatus).filter(
        (status) => status !== MembershipStatus.REMOVED,
      ),
      auditEvent: AUDIT_EVENT_TYPES.MEMBERSHIP_REMOVED,
      apply(request, membership, reason) {
        void request;
        void reason;
        return {
          status: MembershipStatus.REMOVED,
          removedAt: new Date(),
        };
      },
    });
  }

  async reinstate(
    request: Request,
    dto: MembershipReinstateDto,
  ): Promise<MembershipAdminResult> {
    return this.transition(request, dto, {
      target: ACTIVE,
      allowedFrom: [
        MembershipStatus.SUSPENDED,
        MembershipStatus.EXPIRED,
        MembershipStatus.INVITED,
      ],
      auditEvent: AUDIT_EVENT_TYPES.MEMBERSHIP_REINSTATED,
      apply(request, membership, reason) {
        void request;
        void reason;
        const activeFrom = dto.activeFrom
          ? new Date(dto.activeFrom)
          : new Date();
        const activeUntil = dto.activeUntil
          ? new Date(dto.activeUntil)
          : membership.activeUntil;
        if (activeUntil && activeFrom >= activeUntil) {
          throw new MembershipAdminDeniedError('INVALID_WINDOW');
        }
        return { status: ACTIVE, activeFrom, activeUntil };
      },
    });
  }

  private async transition(
    request: Request,
    dto: MembershipAdminDto,
    spec: {
      target: MembershipStatus;
      allowedFrom: MembershipStatus[];
      auditEvent: AuditEventType;
      apply: (
        request: Request,
        membership: Membership,
        reason: string | null,
      ) => Record<string, unknown>;
    },
  ): Promise<MembershipAdminResult> {
    const auth = request.auth;
    if (!auth) {
      throw new MembershipAdminDeniedError('UNAUTHENTICATED');
    }
    const { sessionId, userId, activeTenantId } = auth;
    const correlationId = getCorrelationId(request);
    if (!activeTenantId) {
      throw new MembershipAdminDeniedError('TENANT_CONTEXT_REQUIRED');
    }
    const tenantId = activeTenantId;

    try {
      await this.mfa.assertRecentMfa(sessionId);
    } catch (error) {
      if (error instanceof MfaStepUpRequiredError) {
        await this.enforceMfaFailureLimit(request, sessionId, userId, tenantId);
      }
      throw error;
    }

    const { membershipId: actorMembershipId } =
      await this.permissions.assertTenantPermission({
        request,
        userId,
        tenantId,
        permissionKey: PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP,
        operationId: sessionId,
      });

    let result: MembershipAdminResult;
    try {
      result = await this.prisma.withTenantContext(
        {
          tenantId,
          userId,
          membershipId: actorMembershipId,
          operationId: sessionId,
        },
        async (transaction) => {
          const membership = await transaction.membership.findFirst({
            where: { id: dto.membershipId, tenantId },
          });
          if (!membership) {
            throw new MembershipAdminDeniedError('NO_MEMBERSHIP');
          }
          if (!spec.allowedFrom.includes(membership.status)) {
            throw new MembershipAdminDeniedError('INVALID_STATE');
          }
          const data = spec.apply(request, membership, dto.reason ?? null);
          await transaction.membership.update({
            where: { id: membership.id },
            data,
          });
          await this.audit.write(
            {
              eventType: spec.auditEvent,
              outcome: 'SUCCEEDED',
              actorUserId: userId,
              actorMembershipId: actorMembershipId,
              tenantId,
              targetType: 'membership',
              targetId: membership.id,
              policy: 'CanManageMembership',
              correlationId,
              ipHash: this.optionalHash(request.ip),
              userAgentHash: this.optionalHash(request.headers['user-agent']),
              metadata: dto.reason ? { reason: dto.reason } : undefined,
            },
            transaction,
          );
          return {
            membershipId: membership.id,
            tenantId,
            status: spec.target,
          };
        },
      );
    } catch (error) {
      if (error instanceof MembershipAdminDeniedError) throw error;
      this.logger.warn({
        message: 'Membership administration transition failed',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return result;
  }

  private optionalHash(value: string | string[] | undefined): string | null {
    if (!value) return null;
    const raw = Array.isArray(value) ? value.join(',') : value;
    return raw.length === 0 ? null : hashToken(raw);
  }

  /**
   * Applies the per-actor failed-MFA limit when a sensitive-action MFA
   * step-up is required. Enumerates the failure toward the limit; once the
   * limit is reached the caller is rejected fail-closed with a non-enumerating
   * abuse-control error and an `MFA_RATE_LIMITED` audit event is emitted.
   */
  private async enforceMfaFailureLimit(
    request: Request,
    sessionId: string,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const decision = await this.abuse.enforceMfaFailure(sessionId);
    if (decision.allowed) return;
    await this.abuse.emitAbuseEvent(request, MFA_RATE_LIMITED, {
      actorUserId: userId,
      tenantId,
    });
    throw new AbuseLimitReachedError(
      decision.reason!,
      decision.retryAfterSeconds!,
    );
  }
}
