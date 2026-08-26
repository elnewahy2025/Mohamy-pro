import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../infrastructure/database/prisma.service';
import type { AuthenticatedSession } from '../auth/auth.types';
import {
  AuthorizationDeniedError,
  MfaStepUpRequiredError,
} from './authorization.errors';
import { MfaAssuranceService } from './mfa-assurance.service';
import { evaluateAuthorization } from './policy.evaluator';
import type {
  AuthorizationAccessView,
  AuthorizationDecision,
  AuthorizationMembership,
  AuthorizationRequest,
  AuthorizationRole,
  AuthorizationSnapshot,
  AuthorizationSubject,
  PolicyName,
} from './authorization.types';

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mfa: MfaAssuranceService,
  ) {}

  async authorize(
    input: Omit<AuthorizationRequest, 'snapshot' | 'mfaSatisfied'>,
  ): Promise<AuthorizationDecision> {
    const now = input.now ?? new Date();
    const snapshot = await this.loadSnapshot(
      input.subject,
      input.targetTenantId ?? input.resource?.tenantId,
      now,
    );
    const mfaSatisfied = this.mfa.evaluate(input.subject, now).satisfied;
    return evaluateAuthorization({
      ...input,
      now,
      snapshot,
      mfaSatisfied,
    });
  }

  async assertAuthorized(
    input: Omit<AuthorizationRequest, 'snapshot' | 'mfaSatisfied'>,
  ): Promise<AuthorizationDecision> {
    const decision = await this.authorize(input);
    if (decision.allowed) return decision;
    if (
      decision.reasonCode === 'mfa_step_up_required' ||
      decision.reasonCode === 'platform_admin_mfa_required'
    ) {
      throw new MfaStepUpRequiredError();
    }
    throw new AuthorizationDeniedError();
  }

  async getCurrentAccess(
    session: AuthenticatedSession,
  ): Promise<AuthorizationAccessView> {
    const snapshot = await this.loadSnapshot(
      sessionToAuthorizationSubject(session),
      session.activeTenantId ?? undefined,
      new Date(),
    );
    const roles = [...snapshot.globalRoles, ...snapshot.tenantMembershipRoles];
    return {
      tenantId: session.activeTenantId,
      membershipId: session.activeMembershipId,
      roles: [...new Set(roles.map((role) => role.key))].sort(),
      permissions: [
        ...new Set(roles.flatMap((role) => role.permissions)),
      ].sort(),
    };
  }

  evaluateTenantSwitch(input: {
    subject: AuthorizationSubject;
    membership: AuthorizationMembership;
    now?: Date;
  }): AuthorizationDecision {
    return evaluateAuthorization({
      policy: 'CanSwitchTenant',
      subject: input.subject,
      targetTenantId: input.membership.tenantId,
      snapshot: {
        membership: input.membership,
        tenantMembershipRoles: [],
        globalRoles: [],
        denials: [],
      },
      now: input.now,
      mfaSatisfied: true,
    });
  }

  private async loadSnapshot(
    subject: AuthorizationSubject,
    targetTenantId: string | undefined,
    now: Date,
  ): Promise<AuthorizationSnapshot> {
    const selection = await this.prisma.withMembershipSelectionContext(
      { userId: subject.userId, operationId: randomUUID() },
      async (transaction) => {
        const [membership, globalAssignments] = await Promise.all([
          targetTenantId
            ? transaction.membership.findUnique({
                where: {
                  userId_tenantId: {
                    userId: subject.userId,
                    tenantId: targetTenantId,
                  },
                },
                select: {
                  id: true,
                  tenantId: true,
                  userId: true,
                  status: true,
                  activeFrom: true,
                  activeUntil: true,
                  tenant: { select: { status: true } },
                },
              })
            : Promise.resolve(null),
          transaction.globalRoleAssignment.findMany({
            where: { userId: subject.userId, revokedAt: null },
            include: {
              role: {
                include: {
                  permissions: { include: { permission: true } },
                },
              },
            },
          }),
        ]);
        return { membership, globalAssignments };
      },
    );

    const membership = selection.membership
      ? toAuthorizationMembership(selection.membership)
      : undefined;
    const globalRoles = selection.globalAssignments.map((assignment) =>
      toAuthorizationRole(assignment.role),
    );
    if (!membership || !isEligibleMembership(membership, subject.userId, now)) {
      return {
        membership,
        tenantMembershipRoles: [],
        globalRoles,
        denials: [],
      };
    }

    const tenantData = await this.prisma.withTenantContext(
      {
        tenantId: membership.tenantId,
        userId: subject.userId,
        membershipId: membership.id,
        operationId: randomUUID(),
      },
      async (transaction) => {
        const [membershipRoles, denials] = await Promise.all([
          transaction.membershipRole.findMany({
            where: { membershipId: membership.id, revokedAt: null },
            include: {
              role: {
                include: {
                  permissions: { include: { permission: true } },
                },
              },
            },
          }),
          transaction.accessDenial.findMany({
            where: { tenantId: membership.tenantId },
            select: {
              tenantId: true,
              subjectUserId: true,
              permissionKey: true,
              resourceType: true,
              resourceId: true,
              status: true,
              startsAt: true,
              endsAt: true,
              revokedAt: true,
            },
          }),
        ]);
        return { membershipRoles, denials };
      },
    );

    return {
      membership,
      tenantMembershipRoles: tenantData.membershipRoles.map((assignment) =>
        toAuthorizationRole(assignment.role),
      ),
      globalRoles,
      denials: tenantData.denials.map((denial) => ({
        tenantId: denial.tenantId,
        subjectUserId: denial.subjectUserId,
        permissionKey: denial.permissionKey,
        resourceType: denial.resourceType,
        resourceId: denial.resourceId,
        status: denial.status,
        startsAt: denial.startsAt,
        endsAt: denial.endsAt,
        revokedAt: denial.revokedAt,
      })),
    };
  }
}

function toAuthorizationMembership(input: {
  id: string;
  tenantId: string;
  userId: string;
  status: string;
  activeFrom: Date | null;
  activeUntil: Date | null;
  tenant: { status: string };
}): AuthorizationMembership {
  return {
    id: input.id,
    tenantId: input.tenantId,
    userId: input.userId,
    status: input.status,
    activeFrom: input.activeFrom,
    activeUntil: input.activeUntil,
    tenantStatus: input.tenant.status,
  };
}

function toAuthorizationRole(input: {
  key: string;
  scope: 'GLOBAL' | 'TENANT';
  permissions: Array<{
    permission: { key: string };
  }>;
}): AuthorizationRole {
  return {
    key: input.key,
    scope: input.scope,
    permissions: input.permissions.map(({ permission }) => permission.key),
  };
}

function isEligibleMembership(
  membership: AuthorizationMembership,
  userId: string,
  now: Date,
): boolean {
  return (
    membership.userId === userId &&
    membership.status === 'ACTIVE' &&
    (!membership.activeFrom || membership.activeFrom <= now) &&
    (!membership.activeUntil || membership.activeUntil >= now) &&
    (!membership.tenantStatus || membership.tenantStatus === 'ACTIVE')
  );
}

export function sessionToAuthorizationSubject(
  session: AuthenticatedSession,
): AuthorizationSubject {
  return {
    userId: session.userId,
    userStatus: session.userStatus,
    activeTenantId: session.activeTenantId,
    activeMembershipId: session.activeMembershipId,
    mfaVerifiedAt: session.mfaVerifiedAt,
    mfaAcr: session.mfaAcr,
    mfaAmr: session.mfaAmr,
  };
}

export function policyName(value: string): PolicyName {
  if (
    value === 'CanViewTenant' ||
    value === 'CanManageMembership' ||
    value === 'CanSwitchTenant' ||
    value === 'CanReadOrganizationSettings' ||
    value === 'CanManageRole' ||
    value === 'CanManagePermission' ||
    value === 'CanManageDenial' ||
    value === 'CanAccessResource' ||
    value === 'CanPerformPlatformOperation'
  ) {
    return value;
  }
  throw new Error('Unknown authorization policy');
}
