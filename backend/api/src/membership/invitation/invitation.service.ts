import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  InvitationStatus,
  MembershipStatus,
  Prisma,
  RoleScope,
  TenantStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AbuseControlService } from '../../abuse/abuse-control.service';
import { MFA_RATE_LIMITED } from '../../abuse/abuse-control.constants';
import { AbuseLimitReachedError } from '../../abuse/abuse-control.errors';
import { AUDIT_EVENT_TYPES } from '../../audit/audit-constants';
import { AuditEventService } from '../../audit/audit-event.service';
import { MfaAssuranceService } from '../../auth/mfa/mfa-assurance.service';
import { MfaStepUpRequiredError } from '../../auth/mfa/mfa.errors';
import {
  generateOpaqueToken,
  hashToken,
} from '../../auth/session/session-crypto';
import { getCorrelationId } from '../../common/middleware/correlation-id.middleware';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { PERMISSION_KEYS } from '../../permissions/permission.constants';
import { PermissionsService } from '../../permissions/permissions.service';
import { ROLE_KEY_PLATFORM_ADMIN } from '../../permissions/role.constants';
import type { ValidatedEnvironment } from '../../config/env.validation';
import { InvitationDeniedError } from './invitation.errors';
import type {
  InvitationAcceptDto,
  InvitationCreateDto,
} from './invitation.dto';

export interface InvitationCreateResult {
  invitationId: string;
  token: string;
  tenantId: string;
  expiresAt: Date;
}

export interface InvitationAcceptResult {
  membershipId: string;
  tenantId: string;
  status: MembershipStatus;
  userId: string;
}

const INVITATION_OUTBOX_EVENT = 'membership.invitation.created';

/**
 * Tenant invitation creation and self-service acceptance. Creation is a
 * staff-sensitive, policy-gated tenant operation (recent MFA + CanManageMembership).
 * Acceptance validates the opaque token, identity binding, lifecycle, and
 * tenant state, then atomically links the User/ExternalIdentity, creates the
 * active Membership, and assigns the requested roles.
 */
@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
    private readonly outbox: OutboxService,
    private readonly permissions: PermissionsService,
    private readonly mfa: MfaAssuranceService,
    private readonly configService: ConfigService<ValidatedEnvironment, true>,
    private readonly abuse: AbuseControlService,
  ) {}

  async create(
    request: Request,
    dto: InvitationCreateDto,
  ): Promise<InvitationCreateResult> {
    const auth = request.auth;
    if (!auth) {
      throw new InvitationDeniedError('UNAUTHENTICATED', 401);
    }
    const { sessionId, userId, activeTenantId } = auth;
    const correlationId = getCorrelationId(request);

    if (!activeTenantId) {
      throw new InvitationDeniedError('TENANT_CONTEXT_REQUIRED');
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

    const { membershipId } = await this.permissions.assertTenantPermission({
      request,
      userId,
      tenantId,
      permissionKey: PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP,
      operationId: sessionId,
    });

    const intendedEmailNormalized = dto.intendedEmail
      ? normalizeEmail(dto.intendedEmail)
      : null;
    if (!intendedEmailNormalized && !dto.intendedProviderSubject) {
      throw new InvitationDeniedError('IDENTITY_BINDING_REQUIRED', 400);
    }

    const token = generateOpaqueToken();
    const expiresInSeconds = this.configService.getOrThrow(
      'INVITATION_TTL_SECONDS',
    );
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    let result: InvitationCreateResult;
    try {
      result = await this.prisma.withTenantContext(
        { tenantId, userId, membershipId, operationId: sessionId },
        async (transaction) => {
          await this.assertRolesGrantable(transaction, {
            tenantId,
            membershipId,
            requestedRoleKeys: dto.requestedRoleKeys,
          });

          const invitation = await transaction.invitation.create({
            data: {
              tenantId,
              inviterMembershipId: membershipId,
              tokenHash: hashToken(token),
              intendedEmailNormalized,
              intendedProviderSubject: dto.intendedProviderSubject ?? null,
              requestedRoleKeys: dto.requestedRoleKeys as Prisma.InputJsonValue,
              requestedScope: (dto.requestedScope ??
                null) as Prisma.InputJsonValue,
              status: InvitationStatus.PENDING,
              expiresAt,
            },
            select: { id: true, expiresAt: true },
          });

          await this.audit.write(
            {
              eventType: AUDIT_EVENT_TYPES.MEMBERSHIP_INVITED,
              outcome: 'SUCCEEDED',
              actorUserId: userId,
              actorMembershipId: membershipId,
              tenantId,
              targetType: 'invitation',
              targetId: invitation.id,
              policy: 'CanManageMembership',
              correlationId,
              ipHash: this.optionalHash(request.ip),
              userAgentHash: this.optionalHash(request.headers['user-agent']),
              metadata: {
                roleKeysCount: dto.requestedRoleKeys.length,
                expiresAtIso: invitation.expiresAt.toISOString(),
              },
            },
            transaction,
          );

          await this.outbox.create(
            {
              aggregateType: 'invitation',
              aggregateId: invitation.id,
              eventType: INVITATION_OUTBOX_EVENT,
              tenantId,
              payload: {
                invitationId: invitation.id,
                tenantId,
                correlationId,
              },
            },
            transaction,
          );

          return {
            invitationId: invitation.id,
            token,
            tenantId,
            expiresAt: invitation.expiresAt,
          };
        },
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new InvitationDeniedError('DUPLICATE_INVITATION');
      }
      throw error;
    }

    return result;
  }

  async accept(
    request: Request,
    dto: InvitationAcceptDto,
  ): Promise<InvitationAcceptResult> {
    const auth = request.auth;
    if (!auth) {
      throw new InvitationDeniedError('UNAUTHENTICATED', 401);
    }
    const { sessionId, userId, provider, providerSubject } = auth;

    const abuseDecision = await this.abuse.enforceInvitation(request);
    if (abuseDecision && !abuseDecision.allowed) {
      await this.abuse.emitAbuseEvent(request, abuseDecision.reason!, {
        actorUserId: userId,
      });
      throw new InvitationDeniedError('RATE_LIMITED', 429);
    }

    const correlationId = getCorrelationId(request);

    if (!dto.token || dto.token.length > 4096) {
      throw new InvitationDeniedError('INVALID_TOKEN', 404);
    }
    const tokenHash = hashToken(dto.token);

    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash },
      include: { tenant: { select: { status: true } } },
    });
    const denial = this.acceptDenialReason(invitation);
    if (denial || !invitation) {
      await this.recordDenied(request, {
        correlationId,
        userId,
        sessionId,
        reason: denial ?? 'NOT_FOUND',
        tenantId: invitation?.tenantId ?? null,
      });
      throw new InvitationDeniedError(denial ?? 'NOT_FOUND', 404);
    }
    const validInvitation = invitation;

    // Identity binding must match the authenticated user before any state
    // changes. Reject without revealing whether the binding exists.
    const identityOk = await this.identityMatches(validInvitation, {
      userId,
      provider,
      providerSubject,
    });
    if (!identityOk) {
      await this.recordDenied(request, {
        correlationId,
        userId,
        sessionId,
        reason: 'IDENTITY_MISMATCH',
        tenantId: validInvitation.tenantId,
      });
      throw new InvitationDeniedError('IDENTITY_MISMATCH', 404);
    }

    const consumed = await this.prisma.invitation.updateMany({
      where: { id: validInvitation.id, status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new InvitationDeniedError('ALREADY_CONSUMED', 404);
    }

    const membershipId = randomUUID();
    const requestedRoleKeys = validInvitation.requestedRoleKeys as string[];

    let result: InvitationAcceptResult;
    try {
      result = await this.prisma.withTenantContext(
        {
          tenantId: validInvitation.tenantId,
          userId,
          membershipId,
          operationId: sessionId,
        },
        async (transaction) => {
          await this.ensureUserActive(transaction, userId);
          await this.linkExternalIdentity(transaction, {
            userId,
            provider,
            subject: providerSubject,
          });
          await transaction.membership.create({
            data: {
              id: membershipId,
              tenantId: validInvitation.tenantId,
              userId,
              status: MembershipStatus.ACTIVE,
              activeFrom: new Date(),
              activatedAt: new Date(),
              invitedAt: new Date(),
            },
          });
          await this.assignRoles(transaction, {
            membershipId,
            tenantId: validInvitation.tenantId,
            roleKeys: requestedRoleKeys,
            actorUserId: userId,
            correlationId,
          });
          await this.audit.write(
            {
              eventType: AUDIT_EVENT_TYPES.MEMBERSHIP_ACCEPTED,
              outcome: 'SUCCEEDED',
              actorUserId: userId,
              actorMembershipId: membershipId,
              tenantId: validInvitation.tenantId,
              targetType: 'membership',
              targetId: membershipId,
              correlationId,
              ipHash: this.optionalHash(request.ip),
              userAgentHash: this.optionalHash(request.headers['user-agent']),
              metadata: { roleKeysCount: requestedRoleKeys.length },
            },
            transaction,
          );
          return {
            membershipId,
            tenantId: validInvitation.tenantId,
            status: MembershipStatus.ACTIVE,
            userId,
          };
        },
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new InvitationDeniedError('ALREADY_MEMBER', 404);
      }
      throw error;
    }

    return result;
  }

  private acceptDenialReason(
    invitation:
      | (Awaited<ReturnType<PrismaService['invitation']['findUnique']>> & {
          tenant: { status: TenantStatus };
        })
      | null,
  ): string | null {
    if (!invitation) return 'NOT_FOUND';
    if (invitation.status !== InvitationStatus.PENDING) return 'NOT_PENDING';
    if (invitation.expiresAt <= new Date()) return 'EXPIRED';
    if (invitation.tenant.status !== TenantStatus.ACTIVE) {
      return 'TENANT_NOT_ACTIVE';
    }
    return null;
  }

  private async identityMatches(
    invitation: {
      intendedProviderSubject: string | null;
      intendedEmailNormalized: string | null;
    },
    identity: { userId: string; provider: string; providerSubject: string },
  ): Promise<boolean> {
    if (invitation.intendedProviderSubject) {
      return constantTimeEqual(
        invitation.intendedProviderSubject,
        identity.providerSubject,
      );
    }
    if (invitation.intendedEmailNormalized) {
      const user = await this.prisma.user.findUnique({
        where: { id: identity.userId },
        select: { emailNormalized: true },
      });
      if (!user?.emailNormalized) return false;
      return constantTimeEqual(
        invitation.intendedEmailNormalized,
        user.emailNormalized,
      );
    }
    return false;
  }

  private async assertRolesGrantable(
    transaction: Prisma.TransactionClient,
    input: {
      tenantId: string;
      membershipId: string;
      requestedRoleKeys: string[];
    },
  ): Promise<void> {
    if (input.requestedRoleKeys.includes(ROLE_KEY_PLATFORM_ADMIN)) {
      throw new InvitationDeniedError('CANNOT_GRANT_PLATFORM_ADMIN');
    }
    const [inviterRoles, tenantRoles] = await Promise.all([
      transaction.membershipRole.findMany({
        where: {
          tenantId: input.tenantId,
          membershipId: input.membershipId,
          revokedAt: null,
        },
        select: { role: { select: { key: true } } },
      }),
      transaction.role.findMany({
        where: {
          tenantId: input.tenantId,
          scope: RoleScope.TENANT,
          key: { in: input.requestedRoleKeys },
        },
        select: { key: true },
      }),
    ]);
    const inviterRoleSet = new Set(inviterRoles.map((entry) => entry.role.key));
    const tenantRoleSet = new Set(tenantRoles.map((role) => role.key));
    for (const key of input.requestedRoleKeys) {
      if (!tenantRoleSet.has(key)) {
        throw new InvitationDeniedError('UNKNOWN_ROLE');
      }
      if (!inviterRoleSet.has(key)) {
        throw new InvitationDeniedError('ROLE_NOT_GRANTABLE');
      }
    }
  }

  private async assignRoles(
    transaction: Prisma.TransactionClient,
    input: {
      membershipId: string;
      tenantId: string;
      roleKeys: string[];
      actorUserId: string;
      correlationId: string;
    },
  ): Promise<void> {
    if (input.roleKeys.length === 0) return;
    const roles = await transaction.role.findMany({
      where: {
        tenantId: input.tenantId,
        scope: RoleScope.TENANT,
        key: { in: input.roleKeys },
      },
      select: { id: true, key: true },
    });
    for (const role of roles) {
      await transaction.membershipRole.create({
        data: {
          tenantId: input.tenantId,
          membershipId: input.membershipId,
          roleId: role.id,
        },
      });
      await this.audit.write(
        {
          eventType: AUDIT_EVENT_TYPES.ROLE_ASSIGNED,
          outcome: 'SUCCEEDED',
          actorUserId: input.actorUserId,
          actorMembershipId: input.membershipId,
          tenantId: input.tenantId,
          targetType: 'membership',
          targetId: input.membershipId,
          policy: 'AuthLifecycle',
          reasonCode: null,
          correlationId: input.correlationId,
          metadata: { roleKey: role.key },
        },
        transaction,
      );
    }
  }

  private async ensureUserActive(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (
      user &&
      (user.status === UserStatus.PENDING || user.status === UserStatus.ACTIVE)
    ) {
      if (user.status === UserStatus.PENDING) {
        await transaction.user.update({
          where: { id: userId },
          data: { status: UserStatus.ACTIVE },
        });
      }
      return;
    }
    if (!user) {
      await transaction.user.create({
        data: { id: userId, status: UserStatus.ACTIVE },
      });
    }
  }

  private async linkExternalIdentity(
    transaction: Prisma.TransactionClient,
    input: { userId: string; provider: string; subject: string },
  ): Promise<void> {
    const existing = await transaction.externalIdentity.findUnique({
      where: {
        provider_subject: { provider: input.provider, subject: input.subject },
      },
      select: { id: true },
    });
    if (!existing) {
      await transaction.externalIdentity.create({
        data: {
          userId: input.userId,
          provider: input.provider,
          subject: input.subject,
        },
      });
    }
  }

  private async recordDenied(
    request: Request,
    input: {
      correlationId: string;
      userId: string;
      sessionId: string;
      reason: string;
      tenantId: string | null;
    },
  ): Promise<void> {
    try {
      await this.prisma.withMembershipSelectionContext(
        { userId: input.userId, operationId: input.sessionId },
        async (transaction) => {
          await this.audit.write(
            {
              eventType: AUDIT_EVENT_TYPES.PERMISSION_DENIED,
              outcome: 'DENIED',
              actorUserId: input.userId,
              actorMembershipId: null,
              tenantId: null,
              targetType: 'invitation',
              targetId: input.tenantId ?? null,
              policy: 'InvitationAccept',
              reasonCode: input.reason,
              correlationId: input.correlationId,
              ipHash: this.optionalHash(request.ip),
              userAgentHash: this.optionalHash(request.headers['user-agent']),
              metadata: { permissionKey: 'InvitationAccept' },
            },
            transaction,
          );
        },
      );
    } catch (error) {
      this.logger.warn({
        message: 'Failed to record invitation-denied audit event',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code === 'P2002';
    }
    return false;
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

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function constantTimeEqual(left: string, right: string): boolean {
  return hashToken(left) === hashToken(right);
}
