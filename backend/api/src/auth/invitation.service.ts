import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../config/env.validation';
import type { AuthenticatedSession } from './auth.types';
import { AuditService } from '../infrastructure/audit/audit.service';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { RedisService } from '../infrastructure/redis/redis.service';

const INVITATION_TTL_MS = 72 * 60 * 60 * 1_000;
const INVITATION_TOKEN_BYTES = 32;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;
const PROVIDER_SUBJECT_PATTERN = /^[\x21-\x7e]{1,255}$/;
const ACCEPTANCE_RATE_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export interface InvitationScope {
  organizationIds?: string[];
  branchIds?: string[];
  departmentIds?: string[];
  teamIds?: string[];
}

export interface CreateInvitationInput {
  actorUserId: string;
  actorMembershipId: string;
  tenantId: string;
  correlationId: string;
  intendedEmail?: string;
  intendedProviderSubject?: string;
  requestedRoleKeys: string[];
  requestedScope?: InvitationScope;
}

export interface RevokeInvitationInput {
  actorUserId: string;
  actorMembershipId: string;
  tenantId: string;
  invitationId: string;
  correlationId: string;
}

export interface AcceptInvitationInput {
  session: AuthenticatedSession;
  token: string;
  correlationId: string;
  sourceIp?: string;
}

export interface CreateInvitationResult {
  invitationId: string;
  expiresAt: Date;
  invitationToken: string;
}

export interface RevokeInvitationResult {
  invitationId: string;
  status: 'REVOKED';
}

export interface AcceptInvitationResult {
  invitationId: string;
  tenantId: string;
  membershipId: string;
  roleKeys: string[];
  active: true;
}

type ExpiredTransitionResult = { kind: 'EXPIRED' };

function isExpiredTransition(
  value:
    RevokeInvitationResult | AcceptInvitationResult | ExpiredTransitionResult,
): value is ExpiredTransitionResult {
  return 'kind' in value && value.kind === 'EXPIRED';
}

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<ValidatedEnvironment, true>,
  ) {}

  async create(input: CreateInvitationInput): Promise<CreateInvitationResult> {
    validateAdminInput(input);
    const roleKeys = normalizeRoleKeys(input.requestedRoleKeys);
    const scope = normalizeScope(input.requestedScope);
    const intendedEmail = normalizeInvitationEmail(input.intendedEmail);
    const intendedProviderSubject = normalizeProviderSubject(
      input.intendedProviderSubject,
    );
    assertExactlyOneBinding(intendedEmail, intendedProviderSubject);

    const invitationToken = randomBytes(INVITATION_TOKEN_BYTES).toString(
      'base64url',
    );
    const tokenHash = hashInvitationToken(invitationToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

    return this.prisma.withTenantContext(
      {
        tenantId: input.tenantId,
        userId: input.actorUserId,
        membershipId: input.actorMembershipId,
        operationId: randomUUID(),
      },
      async (transaction) => {
        await assertActiveInviter(
          transaction,
          input.actorUserId,
          input.actorMembershipId,
          input.tenantId,
          now,
        );
        await assertActiveTenant(transaction, input.tenantId);
        await assertTenantRoles(transaction, input.tenantId, roleKeys);
        await assertScopeBelongsToTenant(transaction, input.tenantId, scope);

        const invitation = await transaction.invitation.create({
          data: {
            id: randomUUID(),
            tenantId: input.tenantId,
            inviterMembershipId: input.actorMembershipId,
            tokenHash,
            intendedEmailNormalized: intendedEmail,
            intendedProviderSubject,
            requestedRoleKeys: roleKeys,
            requestedScope: scope ? toJsonScope(scope) : undefined,
            status: 'PENDING',
            expiresAt,
          },
        });
        await this.audit.recordInTransaction(
          {
            eventType: 'membership.invitation.created',
            category: 'AUDIT',
            outcome: 'SUCCEEDED',
            actorUserId: input.actorUserId,
            actorMembershipId: input.actorMembershipId,
            tenantId: input.tenantId,
            targetType: 'Invitation',
            targetId: invitation.id,
            policy: 'CanManageMembership',
            reasonCode: 'invitation_created',
            correlationId: input.correlationId,
            metadata: {
              requestedRoleCount: roleKeys.length,
              invitationStatus: 'PENDING',
            },
          },
          transaction,
        );
        return {
          invitationId: invitation.id,
          expiresAt: invitation.expiresAt,
          invitationToken,
        };
      },
    );
  }

  async revoke(input: RevokeInvitationInput): Promise<RevokeInvitationResult> {
    validateAdminInput(input);
    validateUuid(input.invitationId, 'invitationId');
    const now = new Date();
    const result = await this.prisma.withTenantContext(
      {
        tenantId: input.tenantId,
        userId: input.actorUserId,
        membershipId: input.actorMembershipId,
        operationId: randomUUID(),
      },
      async (
        transaction,
      ): Promise<RevokeInvitationResult | ExpiredTransitionResult> => {
        await assertActiveInviter(
          transaction,
          input.actorUserId,
          input.actorMembershipId,
          input.tenantId,
          now,
        );
        await assertActiveTenant(transaction, input.tenantId);
        const current = await transaction.invitation.findFirst({
          where: { id: input.invitationId, tenantId: input.tenantId },
          select: { id: true, status: true, expiresAt: true },
        });
        if (!current) throw new InvitationInvalidError();
        if (current.status === 'PENDING' && current.expiresAt <= now) {
          const expired = await terminalizeRevokedInvitation(
            transaction,
            input.tenantId,
            input.invitationId,
            hashInvitationToken(
              randomBytes(INVITATION_TOKEN_BYTES).toString('base64url'),
            ),
          );
          if (expired) {
            await this.audit.recordInTransaction(
              {
                eventType: 'membership.invitation.expired',
                category: 'SECURITY',
                outcome: 'DENIED',
                actorUserId: input.actorUserId,
                actorMembershipId: input.actorMembershipId,
                tenantId: input.tenantId,
                targetType: 'Invitation',
                targetId: input.invitationId,
                policy: 'CanManageMembership',
                reasonCode: 'invitation_expired',
                correlationId: input.correlationId,
                metadata: { invitationStatus: 'EXPIRED' },
              },
              transaction,
            );
          }
          return { kind: 'EXPIRED' };
        }
        if (current.status !== 'PENDING') {
          throw new InvitationNotActionableError();
        }
        const tokenHash = hashInvitationToken(
          randomBytes(INVITATION_TOKEN_BYTES).toString('base64url'),
        );
        const updated = await transaction.invitation.updateMany({
          where: {
            id: input.invitationId,
            tenantId: input.tenantId,
            status: 'PENDING',
          },
          data: {
            status: 'REVOKED',
            revokedAt: now,
            tokenHash,
          },
        });
        if (updated.count !== 1) throw new InvitationNotActionableError();
        await this.audit.recordInTransaction(
          {
            eventType: 'membership.invitation.revoked',
            category: 'SECURITY',
            outcome: 'REVOKED',
            actorUserId: input.actorUserId,
            actorMembershipId: input.actorMembershipId,
            tenantId: input.tenantId,
            targetType: 'Invitation',
            targetId: input.invitationId,
            policy: 'CanManageMembership',
            reasonCode: 'invitation_revoked',
            correlationId: input.correlationId,
            metadata: { invitationStatus: 'REVOKED' },
          },
          transaction,
        );
        return { invitationId: input.invitationId, status: 'REVOKED' };
      },
    );
    if (isExpiredTransition(result)) {
      throw new InvitationNotActionableError();
    }
    return result;
  }

  async accept(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
    validateAcceptInput(input);
    const tokenHash = hashInvitationToken(input.token);
    const invalidatedTokenHash = hashInvitationToken(
      randomBytes(INVITATION_TOKEN_BYTES).toString('base64url'),
    );
    await this.enforceAcceptanceLimit(tokenHash, input.sourceIp);
    const now = new Date();
    const acceptanceOperationId = randomUUID();
    const result = await this.prisma.withInvitationAcceptanceContext(
      {
        tenantId: null,
        userId: input.session.userId,
        membershipId: null,
        inviterMembershipId: null,
        invitationTokenHash: tokenHash,
        invalidatedTokenHash,
        operationId: acceptanceOperationId,
      },
      async (
        transaction,
      ): Promise<AcceptInvitationResult | ExpiredTransitionResult> => {
        const invitation = await transaction.invitation.findFirst({
          where: { tokenHash },
          select: {
            id: true,
            tenantId: true,
            inviterMembershipId: true,
            intendedEmailNormalized: true,
            intendedProviderSubject: true,
            requestedRoleKeys: true,
            requestedScope: true,
            status: true,
            expiresAt: true,
          },
        });
        if (!invitation) throw new InvitationInvalidError();
        if (invitation.status !== 'PENDING') {
          throw new InvitationNotActionableError();
        }
        if (invitation.expiresAt <= now) {
          let expiryStage = 'invitation_context_probe';
          let expiryContext: ExpiryContextDiagnostic | null = null;
          try {
            expiryContext = await readExpiryContextDiagnostic(
              transaction,
              tokenHash,
              invalidatedTokenHash,
            );
            expiryStage = 'context_bind';
            await this.prisma.bindInvitationAcceptanceContext(transaction, {
              tenantId: null,
              userId: input.session.userId,
              membershipId: null,
              inviterMembershipId: null,
              invitationTokenHash: tokenHash,
              invalidatedTokenHash,
              operationId: acceptanceOperationId,
            });
            expiryStage = 'invitation_terminalize';
            const terminalized = await terminalizeExpiredInvitation(
              transaction,
              invitation.tenantId,
              invitation.id,
              tokenHash,
              invalidatedTokenHash,
              input.session.userId,
              acceptanceOperationId,
            );
            if (!terminalized) throw new InvitationNotActionableError();
            expiryStage = 'context_bind';
            await this.prisma.bindGlobalOperationContext(
              transaction,
              randomUUID(),
            );
            expiryStage = 'audit_record';
            await this.audit.recordInTransaction(
              {
                eventType: 'membership.invitation.expired',
                category: 'SECURITY',
                outcome: 'DENIED',
                actorUserId: input.session.userId,
                targetType: 'Invitation',
                targetId: invitation.id,
                policy: 'InvitationAcceptance',
                reasonCode: 'invitation_expired',
                correlationId: input.correlationId,
                metadata: { invitationStatus: 'EXPIRED' },
              },
              transaction,
            );
            return { kind: 'EXPIRED' };
          } catch (error) {
            this.logger.error(
              {
                stage: expiryStage,
                errorClass:
                  error instanceof Error ? error.name : 'UnknownError',
                sqlstate: safeSqlState(error),
                sqlcategory: safeSqlCategory(error),
                acceptanceContextValid:
                  expiryContext?.acceptanceContextValid ?? false,
                acceptanceFlag: expiryContext?.acceptanceFlag ?? false,
                presentedHashMatches:
                  expiryContext?.presentedHashMatches ?? false,
                replacementHashMatches:
                  expiryContext?.replacementHashMatches ?? false,
                notGlobalBeforeUpdate:
                  expiryContext?.notGlobalBeforeUpdate ?? false,
              },
              'Invitation expiry transition failed',
            );
            throw error;
          }
        }
        if (
          invitation.intendedProviderSubject !== null &&
          invitation.intendedProviderSubject !== input.session.providerSubject
        ) {
          throw new InvitationIdentityMismatchError();
        }
        if (
          invitation.intendedEmailNormalized !== null &&
          invitation.intendedEmailNormalized !== input.session.emailNormalized
        ) {
          throw new InvitationIdentityMismatchError();
        }

        const operationId = randomUUID();
        await this.prisma.bindInvitationAcceptanceContext(transaction, {
          tenantId: invitation.tenantId,
          userId: input.session.userId,
          membershipId: null,
          inviterMembershipId: invitation.inviterMembershipId,
          invitationTokenHash: tokenHash,
          invalidatedTokenHash,
          operationId,
        });
        const tenant = await transaction.tenant.findUnique({
          where: { id: invitation.tenantId },
          select: { id: true, status: true },
        });
        if (!tenant || tenant.status !== 'ACTIVE') {
          throw new InvitationInvalidError();
        }
        await assertActiveInviterMembership(
          transaction,
          invitation.inviterMembershipId,
          invitation.tenantId,
          now,
        );
        const roleKeys = parseStoredRoleKeys(invitation.requestedRoleKeys);
        const scope = parseStoredScope(invitation.requestedScope);
        const roles = await transaction.role.findMany({
          where: {
            tenantId: invitation.tenantId,
            scope: 'TENANT',
            key: { in: roleKeys },
          },
          select: { id: true, key: true },
        });
        if (roles.length !== roleKeys.length) {
          throw new InvitationInvalidError();
        }
        const user = await transaction.user.findUnique({
          where: { id: input.session.userId },
          select: { id: true, status: true },
        });
        if (!user || (user.status !== 'PENDING' && user.status !== 'ACTIVE')) {
          throw new InvitationInvalidError();
        }
        const existingMembership = await transaction.membership.findUnique({
          where: {
            userId_tenantId: {
              userId: input.session.userId,
              tenantId: invitation.tenantId,
            },
          },
          select: { id: true, status: true },
        });
        if (
          existingMembership &&
          !['INVITED', 'EXPIRED'].includes(existingMembership.status)
        ) {
          throw new InvitationNotActionableError();
        }

        const membership = existingMembership
          ? await transaction.membership.update({
              where: {
                id_tenantId: {
                  id: existingMembership.id,
                  tenantId: invitation.tenantId,
                },
              },
              data: {
                status: 'ACTIVE',
                activeFrom: now,
                activeUntil: null,
                invitedAt: undefined,
                activatedAt: now,
                suspendedAt: null,
                removedAt: null,
              },
            })
          : await transaction.membership.create({
              data: {
                id: randomUUID(),
                tenantId: invitation.tenantId,
                userId: input.session.userId,
                status: 'ACTIVE',
                activeFrom: now,
                invitedAt: now,
                activatedAt: now,
              },
            });
        await this.prisma.bindInvitationAcceptanceContext(transaction, {
          tenantId: invitation.tenantId,
          userId: input.session.userId,
          membershipId: membership.id,
          inviterMembershipId: invitation.inviterMembershipId,
          invitationTokenHash: tokenHash,
          invalidatedTokenHash,
          operationId,
        });
        await assertScopeBelongsToTenant(
          transaction,
          invitation.tenantId,
          scope,
        );
        for (const role of roles) {
          await transaction.membershipRole.upsert({
            where: {
              membershipId_roleId: {
                membershipId: membership.id,
                roleId: role.id,
              },
            },
            create: {
              id: randomUUID(),
              tenantId: invitation.tenantId,
              membershipId: membership.id,
              roleId: role.id,
              assignmentScope: scope ? toJsonScope(scope) : undefined,
            },
            update: {
              revokedAt: null,
              assignmentScope: scope ? toJsonScope(scope) : Prisma.JsonNull,
            },
          });
        }
        if (user.status === 'PENDING') {
          await transaction.user.update({
            where: { id: input.session.userId },
            data: { status: 'ACTIVE' },
          });
        }
        const invitationUpdate = await transaction.invitation.updateMany({
          where: {
            id: invitation.id,
            tenantId: invitation.tenantId,
            status: 'PENDING',
            tokenHash,
          },
          data: {
            status: 'ACCEPTED',
            acceptedAt: now,
            tokenHash: invalidatedTokenHash,
          },
        });
        if (invitationUpdate.count !== 1) {
          throw new InvitationNotActionableError();
        }
        await this.audit.recordInTransaction(
          {
            eventType: 'membership.invitation.accepted',
            category: 'AUDIT',
            outcome: 'SUCCEEDED',
            actorUserId: input.session.userId,
            actorMembershipId: membership.id,
            tenantId: invitation.tenantId,
            targetType: 'Invitation',
            targetId: invitation.id,
            policy: 'InvitationAcceptance',
            reasonCode: 'identity_bound',
            correlationId: input.correlationId,
            metadata: {
              requestedRoleCount: roleKeys.length,
              invitationStatus: 'ACCEPTED',
            },
          },
          transaction,
        );
        return {
          invitationId: invitation.id,
          tenantId: invitation.tenantId,
          membershipId: membership.id,
          roleKeys,
          active: true,
        };
      },
    );
    if (isExpiredTransition(result)) {
      throw new InvitationNotActionableError();
    }
    return result;
  }

  private async enforceAcceptanceLimit(
    tokenHash: string,
    sourceIp: string | undefined,
  ): Promise<void> {
    const windowSeconds = this.config.getOrThrow<number>(
      'INVITATION_ACCEPTANCE_WINDOW_SECONDS',
    );
    const maxAttempts = this.config.getOrThrow<number>(
      'INVITATION_ACCEPTANCE_MAX_ATTEMPTS',
    );
    const bucket = Math.floor(Date.now() / (windowSeconds * 1_000));
    const ipHash = createHash('sha256')
      .update(sourceIp?.trim() || 'unknown')
      .digest('hex')
      .slice(0, 32);
    const key = `mohamy:invitation-acceptance:${tokenHash.slice(0, 32)}:${ipHash}:${bucket}`;
    try {
      const rawCount = await this.redis
        .getClient()
        .eval(ACCEPTANCE_RATE_SCRIPT, 1, key, windowSeconds);
      const count = Number(rawCount);
      if (!Number.isInteger(count) || count < 1) {
        throw new Error(
          'Invitation acceptance limiter returned an invalid count',
        );
      }
      if (count > maxAttempts) throw new InvitationRateLimitedError();
    } catch (error) {
      if (error instanceof InvitationRateLimitedError) throw error;
      throw new InvitationLimiterUnavailableError();
    }
  }
}

export class InvitationInvalidError extends BadRequestException {
  constructor() {
    super('INVITATION_INVALID');
  }
}

export class InvitationIdentityMismatchError extends ForbiddenException {
  constructor() {
    super('INVITATION_INVALID');
  }
}

export class InvitationNotActionableError extends ConflictException {
  constructor() {
    super('INVITATION_NOT_ACTIONABLE');
  }
}

export class InvitationRateLimitedError extends HttpException {
  constructor() {
    super('INVITATION_RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class InvitationLimiterUnavailableError extends ServiceUnavailableException {
  constructor() {
    super('SERVICE_UNAVAILABLE');
  }
}

function validateAdminInput(
  input: Pick<
    CreateInvitationInput | RevokeInvitationInput,
    'actorUserId' | 'actorMembershipId' | 'tenantId' | 'correlationId'
  >,
): void {
  validateUuid(input.actorUserId, 'actorUserId');
  validateUuid(input.actorMembershipId, 'actorMembershipId');
  validateUuid(input.tenantId, 'tenantId');
  validateUuid(input.correlationId, 'correlationId');
}

function validateAcceptInput(input: AcceptInvitationInput): void {
  validateUuid(input.session.userId, 'userId');
  validateUuid(input.session.sessionId, 'sessionId');
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) {
    throw new InvitationInvalidError();
  }
  validateUuid(input.correlationId, 'correlationId');
}

function validateUuid(value: string, field: string): void {
  if (!UUID_V4_PATTERN.test(value)) throw new InvitationInvalidError();
  if (field === 'correlationId' && !UUID_V4_PATTERN.test(value)) {
    throw new BadRequestException(`${field} must be UUIDv4`);
  }
}

function normalizeInvitationEmail(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new InvitationInvalidError();
  }
  return normalized;
}

function normalizeProviderSubject(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!PROVIDER_SUBJECT_PATTERN.test(normalized)) {
    throw new InvitationInvalidError();
  }
  return normalized;
}

function assertExactlyOneBinding(
  email: string | undefined,
  providerSubject: string | undefined,
): void {
  if ((email === undefined) === (providerSubject === undefined)) {
    throw new InvitationInvalidError();
  }
}

function normalizeRoleKeys(value: string[]): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) {
    throw new InvitationInvalidError();
  }
  const result = value.map((roleKey) => roleKey.trim());
  if (
    result.some((roleKey) => !ROLE_KEY_PATTERN.test(roleKey)) ||
    new Set(result).size !== result.length
  ) {
    throw new InvitationInvalidError();
  }
  return result;
}

function normalizeScope(
  value: InvitationScope | undefined,
): InvitationScope | undefined {
  if (value === undefined) return undefined;
  const allowedFields = new Set([
    'organizationIds',
    'branchIds',
    'departmentIds',
    'teamIds',
  ]);
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw new InvitationInvalidError();
  }
  const result: InvitationScope = {};
  for (const field of [
    'organizationIds',
    'branchIds',
    'departmentIds',
    'teamIds',
  ] as const) {
    const values = value[field];
    if (values === undefined) continue;
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.length > 100 ||
      values.some((item) => !UUID_V4_PATTERN.test(item))
    ) {
      throw new InvitationInvalidError();
    }
    const unique = [...new Set(values)];
    if (unique.length !== values.length) throw new InvitationInvalidError();
    result[field] = unique;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseStoredRoleKeys(value: Prisma.JsonValue): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item): item is string => typeof item === 'string')
  ) {
    throw new InvitationInvalidError();
  }
  return normalizeRoleKeys(value);
}

function toJsonScope(scope: InvitationScope): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue> = {};
  for (const field of [
    'organizationIds',
    'branchIds',
    'departmentIds',
    'teamIds',
  ] as const) {
    const values = scope[field];
    if (values !== undefined) result[field] = [...values];
  }
  return result;
}

function parseStoredScope(
  value: Prisma.JsonValue | null,
): InvitationScope | undefined {
  if (value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new InvitationInvalidError();
  }
  return normalizeScope(value);
}

async function assertActiveInviter(
  transaction: Prisma.TransactionClient,
  actorUserId: string,
  actorMembershipId: string,
  tenantId: string,
  now: Date,
): Promise<void> {
  const membership = await transaction.membership.findUnique({
    where: { id_tenantId: { id: actorMembershipId, tenantId } },
    select: {
      userId: true,
      status: true,
      activeFrom: true,
      activeUntil: true,
      tenant: { select: { status: true } },
    },
  });
  if (
    !membership ||
    membership.userId !== actorUserId ||
    membership.status !== 'ACTIVE' ||
    (membership.activeFrom !== null && membership.activeFrom > now) ||
    (membership.activeUntil !== null && membership.activeUntil < now) ||
    membership.tenant.status !== 'ACTIVE'
  ) {
    throw new InvitationInvalidError();
  }
}

async function assertActiveInviterMembership(
  transaction: Prisma.TransactionClient,
  inviterMembershipId: string,
  tenantId: string,
  now: Date,
): Promise<void> {
  const membership = await transaction.membership.findUnique({
    where: { id_tenantId: { id: inviterMembershipId, tenantId } },
    select: {
      status: true,
      activeFrom: true,
      activeUntil: true,
    },
  });
  if (
    !membership ||
    membership.status !== 'ACTIVE' ||
    (membership.activeFrom !== null && membership.activeFrom > now) ||
    (membership.activeUntil !== null && membership.activeUntil < now)
  ) {
    throw new InvitationInvalidError();
  }
}

async function assertActiveTenant(
  transaction: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  const tenant = await transaction.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true },
  });
  if (!tenant || tenant.status !== 'ACTIVE') throw new InvitationInvalidError();
}

async function assertTenantRoles(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  roleKeys: string[],
): Promise<void> {
  const roles = await transaction.role.findMany({
    where: { tenantId, scope: 'TENANT', key: { in: roleKeys } },
    select: { key: true },
  });
  if (roles.length !== roleKeys.length) throw new InvitationInvalidError();
}

async function assertScopeBelongsToTenant(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  scope: InvitationScope | undefined,
): Promise<void> {
  if (!scope) return;
  const checks: Array<Promise<number>> = [];
  if (scope.organizationIds) {
    checks.push(
      transaction.organization.count({
        where: { tenantId, id: { in: scope.organizationIds } },
      }),
    );
  }
  if (scope.branchIds) {
    checks.push(
      transaction.branch.count({
        where: { tenantId, id: { in: scope.branchIds } },
      }),
    );
  }
  if (scope.departmentIds) {
    checks.push(
      transaction.department.count({
        where: { tenantId, id: { in: scope.departmentIds } },
      }),
    );
  }
  if (scope.teamIds) {
    checks.push(
      transaction.team.count({
        where: { tenantId, id: { in: scope.teamIds } },
      }),
    );
  }
  const expected = Object.values(scope).reduce(
    (total, values) => total + (values?.length ?? 0),
    0,
  );
  const counts = await Promise.all(checks);
  if (counts.reduce((total, count) => total + count, 0) !== expected) {
    throw new InvitationInvalidError();
  }
}

interface ExpiryContextDiagnostic {
  acceptanceContextValid: boolean;
  acceptanceFlag: boolean;
  presentedHashMatches: boolean;
  replacementHashMatches: boolean;
  notGlobalBeforeUpdate: boolean;
}

async function readExpiryContextDiagnostic(
  transaction: Prisma.TransactionClient,
  tokenHash: string,
  invalidatedTokenHash: string,
): Promise<ExpiryContextDiagnostic> {
  const rows = await transaction.$queryRaw<
    Array<{
      acceptance_context_valid: boolean;
      acceptance_flag: boolean;
      presented_hash_matches: boolean;
      replacement_hash_matches: boolean;
      not_global_before_update: boolean;
    }>
  >`
    SELECT
      public.app_invitation_acceptance_context_is_valid() AS acceptance_context_valid,
      current_setting('app.invitation_acceptance', true) = 'true' AS acceptance_flag,
      current_setting('app.invitation_token_hash', true) = ${tokenHash} AS presented_hash_matches,
      current_setting('app.invitation_invalidated_token_hash', true) = ${invalidatedTokenHash} AS replacement_hash_matches,
      current_setting('app.global_operation', true) <> 'true' AS not_global_before_update
  `;
  const row = rows[0];
  return {
    acceptanceContextValid: row?.acceptance_context_valid === true,
    acceptanceFlag: row?.acceptance_flag === true,
    presentedHashMatches: row?.presented_hash_matches === true,
    replacementHashMatches: row?.replacement_hash_matches === true,
    notGlobalBeforeUpdate: row?.not_global_before_update === true,
  };
}

async function terminalizeExpiredInvitation(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  invitationId: string,
  tokenHash: string,
  invalidatedTokenHash: string,
  userId: string,
  operationId: string,
): Promise<boolean> {
  const updated = await transaction.$executeRaw`
    WITH acceptance_context AS MATERIALIZED (
      SELECT
        set_config('app.tenant_id', '', true),
        set_config('app.user_id', ${userId}, true),
        set_config('app.membership_id', '', true),
        set_config('app.operation_id', ${operationId}, true),
        set_config('app.global_operation', 'false', true),
        set_config('app.outbox_dispatcher', 'false', true),
        set_config('app.idempotency_maintenance', 'false', true),
        set_config('app.audit_retention_purge', 'false', true),
        set_config('app.invitation_acceptance', 'true', true),
        set_config('app.invitation_token_hash', ${tokenHash}, true),
        set_config('app.invitation_invalidated_token_hash', ${invalidatedTokenHash}, true),
        set_config('app.inviter_membership_id', '', true)
    )
    UPDATE "public"."Invitation"
    SET
      "status" = 'EXPIRED',
      "tokenHash" = ${invalidatedTokenHash},
      "updatedAt" = CURRENT_TIMESTAMP
    FROM acceptance_context
    WHERE "public"."Invitation"."id" = ${invitationId}
      AND "public"."Invitation"."tenantId" = ${tenantId}
      AND "public"."Invitation"."status" = 'PENDING'
  `;
  return updated === 1;
}

async function terminalizeRevokedInvitation(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  invitationId: string,
  invalidatedTokenHash: string,
): Promise<boolean> {
  const updated = await transaction.invitation.updateMany({
    where: { id: invitationId, tenantId, status: 'PENDING' },
    data: { status: 'EXPIRED', tokenHash: invalidatedTokenHash },
  });
  return updated.count === 1;
}

function safeSqlState(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'none';
  const record = error as Record<string, unknown>;
  const driver = record.driverAdapterError;
  const cause =
    typeof driver === 'object' && driver !== null
      ? (driver as Record<string, unknown>).cause
      : null;
  const nestedCode =
    typeof cause === 'object' && cause !== null
      ? (cause as Record<string, unknown>).originalCode
      : null;
  if (typeof nestedCode === 'string' && /^[0-9A-Z]{5}$/.test(nestedCode)) {
    return nestedCode;
  }
  const code = record.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : 'none';
}

function safeSqlCategory(error: unknown): string {
  const code = safeSqlState(error);
  if (code === '23505') return 'unique_violation';
  if (code === '23503') return 'foreign_key_violation';
  if (code === '23502') return 'not_null_violation';
  if (code === '22P02') return 'invalid_text_representation';
  if (code === '23514') return 'check_constraint';
  if (code === '42501') return 'insufficient_privilege';
  if (code === '42P01') return 'undefined_table';
  if (code === '42703') return 'undefined_column';
  return 'unknown';
}

function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
