import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import {
  AppSession,
  MembershipStatus,
  Prisma,
  RoleScope,
  TenantStatus,
  type HierarchyStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import {
  AuditEventService,
  AuditEventInput,
} from '../audit/audit-event.service';
import { getCorrelationId } from '../common/middleware/correlation-id.middleware';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { OutboxService } from '../infrastructure/outbox/outbox.service';
import { constantTimeEqual, hashToken } from '../auth/session/session-crypto';
import { BootstrapConfig, BootstrapConfigService } from './bootstrap.config';
import {
  BOOTSTRAP_DENIED_REASON,
  BOOTSTRAP_ROLE_KEY_GLOBAL,
  BOOTSTRAP_ROLE_KEY_TENANT,
  BOOTSTRAP_ROLE_NAME_GLOBAL,
  BOOTSTRAP_ROLE_NAME_TENANT,
  type BootstrapDeniedReason,
} from './bootstrap.constants';
import {
  BootstrapDeniedError,
  BootstrapNotConfiguredError,
} from './bootstrap.errors';

export interface BootstrapResult {
  tenantId: string;
  slug: string;
  name: string;
  organizationId: string;
  membershipId: string;
}

const ACTIVE: HierarchyStatus = 'ACTIVE';
const TENANT_OUTBOX_EVENT = 'tenant.bootstrap.succeeded';

@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
    private readonly outbox: OutboxService,
    private readonly configService: BootstrapConfigService,
  ) {}

  async bootstrap(request: Request, secret: string): Promise<BootstrapResult> {
    const config = this.configService.load();
    if (!config) {
      throw new BootstrapNotConfiguredError();
    }

    const auth = request.auth;
    if (!auth) {
      throw new BootstrapDeniedError(BOOTSTRAP_DENIED_REASON.UNAUTHENTICATED);
    }
    const { sessionId, userId } = auth;
    const correlationId = getCorrelationId(request);

    const session = await this.prisma.appSession.findUnique({
      where: { id: sessionId },
      select: { providerSubject: true, mfaVerifiedAt: true },
    });
    if (!session) {
      throw new BootstrapDeniedError(BOOTSTRAP_DENIED_REASON.UNAUTHENTICATED);
    }

    const refusal = await this.refusalReason(config, session, secret);
    if (refusal) {
      await this.recordDeniedEvent({
        request,
        correlationId,
        userId,
        sessionId,
        reason: refusal,
      });
      throw new BootstrapDeniedError(refusal);
    }

    const tenantId = randomUUID();
    const organizationId = randomUUID();
    const membershipId = randomUUID();

    let result: BootstrapResult;
    try {
      result = await this.prisma.withTenantContext(
        {
          tenantId,
          userId,
          membershipId,
          operationId: sessionId,
        },
        async (transaction) => {
          const now = new Date();

          await transaction.tenant.create({
            data: {
              id: tenantId,
              slug: config.tenantSlug,
              name: config.tenantName,
              status: TenantStatus.ACTIVE,
            },
          });

          await transaction.organization.create({
            data: {
              id: organizationId,
              tenantId,
              slug: config.organizationSlug,
              name: config.organizationName,
              status: ACTIVE,
            },
          });

          await transaction.membership.create({
            data: {
              id: membershipId,
              tenantId,
              userId,
              status: MembershipStatus.ACTIVE,
              activatedAt: now,
            },
          });

          const globalRole =
            await this.ensureGlobalPlatformAdminRole(transaction);
          await transaction.globalRoleAssignment.create({
            data: {
              userId,
              roleId: globalRole.id,
              assignedAt: now,
            },
          });

          const tenantRole = await transaction.role.create({
            data: {
              tenantId,
              scope: RoleScope.TENANT,
              key: BOOTSTRAP_ROLE_KEY_TENANT,
              name: BOOTSTRAP_ROLE_NAME_TENANT,
            },
          });
          await transaction.membershipRole.create({
            data: {
              tenantId,
              membershipId,
              roleId: tenantRole.id,
              assignedAt: now,
            },
          });

          await transaction.platformBootstrap.create({
            data: {
              operatorUserId: userId,
              tenantId,
              secretHash: hashToken(secret),
            },
          });

          await this.audit.write(
            {
              eventType: AUDIT_EVENT_TYPES.TENANT_BOOTSTRAP_SUCCEEDED,
              outcome: 'SUCCEEDED',
              actorUserId: userId,
              actorMembershipId: membershipId,
              tenantId,
              targetType: 'tenant',
              targetId: tenantId,
              correlationId,
              ipHash: this.optionalHash(request.ip),
              userAgentHash: this.optionalHash(request.headers['user-agent']),
              metadata: {
                tenantSlug: config.tenantSlug,
                organizationSlug: config.organizationSlug,
              },
            },
            transaction,
          );

          await this.outbox.create(
            {
              aggregateType: 'bootstrap',
              aggregateId: tenantId,
              eventType: TENANT_OUTBOX_EVENT,
              payload: {
                tenantId,
                organizationId,
                correlationId,
              },
            },
            transaction,
          );

          return {
            tenantId,
            slug: config.tenantSlug,
            name: config.tenantName,
            organizationId,
            membershipId,
          };
        },
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        await this.recordDeniedEvent({
          request,
          correlationId,
          userId,
          sessionId,
          reason: BOOTSTRAP_DENIED_REASON.ALREADY_BOOTSTRAPPED,
        });
        throw new BootstrapDeniedError(
          BOOTSTRAP_DENIED_REASON.ALREADY_BOOTSTRAPPED,
        );
      }
      throw error;
    }

    return result;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code === 'P2002';
    }
    return false;
  }

  private async refusalReason(
    config: BootstrapConfig,
    session: Pick<AppSession, 'providerSubject' | 'mfaVerifiedAt'>,
    secret: string,
  ): Promise<BootstrapDeniedReason | null> {
    if (!constantTimeEqual(session.providerSubject, config.subject)) {
      return BOOTSTRAP_DENIED_REASON.SUBJECT_MISMATCH;
    }

    if (!session.mfaVerifiedAt) {
      return BOOTSTRAP_DENIED_REASON.MFA_REQUIRED;
    }
    const mfaMaxAgeMs = config.mfaMaxAgeSeconds * 1000;
    if (Date.now() - session.mfaVerifiedAt.getTime() > mfaMaxAgeMs) {
      return BOOTSTRAP_DENIED_REASON.MFA_STALE;
    }

    const bootstrapMarker = await this.prisma.platformBootstrap.findFirst({
      select: { id: true },
    });
    if (bootstrapMarker) {
      return BOOTSTRAP_DENIED_REASON.ALREADY_BOOTSTRAPPED;
    }

    const activePlatformAdmin =
      await this.prisma.globalRoleAssignment.findFirst({
        where: {
          revokedAt: null,
          role: {
            scope: RoleScope.GLOBAL,
            key: BOOTSTRAP_ROLE_KEY_GLOBAL,
          },
        },
        select: { id: true },
      });
    if (activePlatformAdmin) {
      return BOOTSTRAP_DENIED_REASON.PLATFORM_ADMIN_EXISTS;
    }

    if (!constantTimeEqual(secret, config.secret)) {
      return BOOTSTRAP_DENIED_REASON.SECRET_MISMATCH;
    }

    return null;
  }

  private async ensureGlobalPlatformAdminRole(
    transaction: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    const existing = await transaction.role.findFirst({
      where: {
        key: BOOTSTRAP_ROLE_KEY_GLOBAL,
        scope: RoleScope.GLOBAL,
      },
      select: { id: true },
    });
    if (existing) return existing;
    return transaction.role.create({
      data: {
        scope: RoleScope.GLOBAL,
        key: BOOTSTRAP_ROLE_KEY_GLOBAL,
        name: BOOTSTRAP_ROLE_NAME_GLOBAL,
      },
      select: { id: true },
    });
  }

  private async recordDeniedEvent(input: {
    request: Request;
    correlationId: string;
    userId: string;
    sessionId: string;
    reason: BootstrapDeniedReason;
  }): Promise<void> {
    try {
      await this.prisma.withMembershipSelectionContext(
        { userId: input.userId, operationId: input.sessionId },
        async (transaction) => {
          await this.audit.write(
            {
              eventType: AUDIT_EVENT_TYPES.TENANT_BOOTSTRAP_DENIED,
              outcome: 'DENIED',
              actorUserId: input.userId,
              actorMembershipId: null,
              tenantId: null,
              targetType: 'tenant',
              targetId: null,
              policy: 'PlatformBootstrap',
              reasonCode: input.reason,
              correlationId: input.correlationId,
              ipHash: this.optionalHash(input.request.ip),
              userAgentHash: this.optionalHash(
                input.request.headers['user-agent'],
              ),
              metadata: { reason: input.reason },
            } satisfies AuditEventInput,
            transaction,
          );
        },
      );
    } catch (error) {
      this.logger.warn({
        message: 'Failed to record platform-bootstrap denied audit event',
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
