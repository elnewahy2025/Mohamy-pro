import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserStatus } from '@prisma/client';
import type { ValidatedEnvironment } from '../config/env.validation';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { AuditService } from '../infrastructure/audit/audit.service';
import { AuthenticationError } from './auth.errors';
import type {
  AuthSessionView,
  AuthenticatedSession,
  OidcIdentityClaims,
  OidcTokenResponse,
} from './auth.types';
import { OIDC_CLIENT, type OidcClientPort } from './oidc-client.port';
import { SessionCryptoService } from './session-crypto.service';

const SESSION_COOKIE_BYTES = 32;
const CSRF_TOKEN_BYTES = 32;
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: SessionCryptoService,
    @Inject(OIDC_CLIENT) private readonly oidc: OidcClientPort,
    private readonly config: ConfigService<ValidatedEnvironment, true>,
    private readonly audit: AuditService,
  ) {}

  async createFromOidc(
    claims: OidcIdentityClaims,
    tokens: OidcTokenResponse,
  ): Promise<{ cookieValue: string; session: AuthenticatedSession }> {
    if (!tokens.refresh_token) {
      throw new AuthenticationError('AUTHENTICATION_PROVIDER_INVALID');
    }
    const refreshToken = tokens.refresh_token;
    const cookieValue = randomBytes(SESSION_COOKIE_BYTES).toString('base64url');
    const csrfValue = randomBytes(CSRF_TOKEN_BYTES).toString('base64url');
    const now = new Date();
    const idleExpiresAt = new Date(
      now.getTime() +
        this.config.getOrThrow<number>('SESSION_IDLE_TTL_SECONDS') * 1_000,
    );
    const absoluteExpiresAt = new Date(
      now.getTime() +
        this.config.getOrThrow<number>('SESSION_ABSOLUTE_TTL_SECONDS') * 1_000,
    );
    const provider = this.config.getOrThrow<string>('OIDC_ISSUER_URL');
    const email = normalizeEmail(claims.email, claims.email_verified);
    const operationId = randomUUID();
    const user = await this.prisma.withGlobalOperationContext(
      operationId,
      async (transaction) => {
        const userId = await this.resolveOrCreateUserIdInTransaction(
          transaction,
          claims,
          provider,
          email,
        );
        const current = await transaction.user.findUnique({
          where: { id: userId },
        });
        if (!current || !isLoginAllowed(current.status)) {
          throw new AuthenticationError();
        }
        await this.prisma.bindMembershipSelectionContext(transaction, {
          userId,
          operationId: randomUUID(),
        });
        const activeMembershipCount = await countActiveMemberships(
          transaction,
          userId,
          now,
        );
        await this.prisma.bindGlobalOperationContext(transaction, operationId);
        const created = await transaction.appSession.create({
          data: {
            userId,
            tokenHash: this.crypto.hash(cookieValue),
            csrfTokenHash: this.crypto.hash(csrfValue),
            csrfTokenCiphertext: this.crypto.encrypt(csrfValue),
            status: 'ACTIVE',
            provider,
            providerSubject: claims.sub,
            providerSessionId: claims.sid,
            issuedAt: now,
            lastUsedAt: now,
            idleExpiresAt,
            absoluteExpiresAt,
            mfaVerifiedAt: claims.amr?.includes('mfa') ? now : undefined,
            mfaAcr: claims.acr,
            mfaAmr: claims.amr,
            providerRefreshTokenCiphertext: this.crypto.encrypt(refreshToken),
          },
        });
        await this.audit.recordInTransaction(
          {
            eventType: 'auth.login.succeeded',
            category: 'AUDIT',
            outcome: 'SUCCEEDED',
            actorUserId: current.id,
            targetType: 'AppSession',
            targetId: created.id,
            policy: 'Authentication',
            reasonCode: 'oidc_authorization_code',
            correlationId: randomUUID(),
            metadata: { activeMembershipCount },
          },
          transaction,
        );
        return {
          sessionId: created.id,
          userId: current.id,
          userStatus: current.status,
          userLocale: current.locale,
          providerSubject: claims.sub,
          emailNormalized: current.emailNormalized,
          csrfTokenHash: created.csrfTokenHash,
          issuedAt: created.issuedAt,
          lastUsedAt: created.lastUsedAt,
          idleExpiresAt: created.idleExpiresAt,
          absoluteExpiresAt: created.absoluteExpiresAt,
          mfaVerifiedAt: created.mfaVerifiedAt,
          mfaAcr: created.mfaAcr,
          mfaAmr: created.mfaAmr,
          activeMembershipCount,
          activeTenantId: created.activeTenantId,
          activeMembershipId: created.activeMembershipId,
          contextVersion: created.contextVersion,
        };
      },
    );
    return { cookieValue, session: user };
  }

  async findByCookie(
    cookieValue: string,
  ): Promise<AuthenticatedSession | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(cookieValue)) return null;
    const tokenHash = this.crypto.hash(cookieValue);
    const now = new Date();
    return this.prisma.withGlobalOperationContext(
      randomUUID(),
      async (transaction) => {
        const session = await transaction.appSession.findUnique({
          where: { tokenHash },
          include: { user: true },
        });
        if (!session || session.status !== 'ACTIVE') return null;
        if (!isLoginAllowed(session.user.status)) {
          await revokeActiveSessionsInTransaction(
            transaction,
            session.userId,
            'account_status',
            now,
          );
          return null;
        }
        if (session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) {
          await transaction.appSession.update({
            where: { id: session.id },
            data: {
              status: 'EXPIRED',
              revokedAt: now,
              revokedReason: 'expired',
              providerRefreshTokenCiphertext: null,
              csrfTokenCiphertext: null,
            },
          });
          await this.audit.recordInTransaction(
            {
              eventType: 'auth.session.revoked',
              category: 'SECURITY',
              outcome: 'REVOKED',
              actorUserId: session.userId,
              targetType: 'AppSession',
              targetId: session.id,
              policy: 'SessionLifecycle',
              reasonCode: 'expired',
              correlationId: randomUUID(),
              metadata: {},
            },
            transaction,
          );
          return null;
        }
        let activeTenantId = session.activeTenantId;
        let activeMembershipId = session.activeMembershipId;
        let contextVersion = session.contextVersion;
        await this.prisma.bindMembershipSelectionContext(transaction, {
          userId: session.userId,
          operationId: randomUUID(),
        });
        if (activeTenantId && activeMembershipId) {
          const selectedMembership = await transaction.membership.findUnique({
            where: {
              id_tenantId: {
                id: activeMembershipId,
                tenantId: activeTenantId,
              },
            },
            select: {
              userId: true,
              status: true,
              activeFrom: true,
              activeUntil: true,
              tenant: { select: { status: true } },
            },
          });
          if (
            !isMembershipCurrentlyEligible(
              selectedMembership,
              now,
              session.user.status,
            )
          ) {
            activeTenantId = null;
            activeMembershipId = null;
            contextVersion += 1;
            await this.prisma.bindGlobalOperationContext(
              transaction,
              randomUUID(),
            );
            await transaction.appSession.update({
              where: { id: session.id },
              data: {
                activeTenantId: null,
                activeMembershipId: null,
                contextVersion,
              },
            });
            await this.audit.recordInTransaction(
              {
                eventType: 'tenant.switch.denied',
                category: 'SECURITY',
                outcome: 'DENIED',
                actorUserId: session.userId,
                targetType: 'Tenant',
                targetId: session.activeTenantId ?? undefined,
                policy: 'SessionTenantContext',
                reasonCode: 'membership_not_eligible',
                correlationId: randomUUID(),
                metadata: {
                  sourceTenantId: session.activeTenantId,
                  targetTenantId: session.activeTenantId,
                },
              },
              transaction,
            );
            await this.prisma.bindMembershipSelectionContext(transaction, {
              userId: session.userId,
              operationId: randomUUID(),
            });
          }
        }
        const activeMembershipCount = await countActiveMemberships(
          transaction,
          session.userId,
          now,
        );
        await this.prisma.bindGlobalOperationContext(transaction, randomUUID());
        if (
          now.getTime() - session.lastUsedAt.getTime() >=
          LAST_USED_WRITE_INTERVAL_MS
        ) {
          await transaction.appSession.update({
            where: { id: session.id },
            data: { lastUsedAt: now },
          });
        }
        return {
          sessionId: session.id,
          userId: session.userId,
          userStatus: session.user.status,
          userLocale: session.user.locale,
          providerSubject: session.providerSubject,
          emailNormalized: session.user.emailNormalized,
          csrfTokenHash: session.csrfTokenHash,
          issuedAt: session.issuedAt,
          lastUsedAt:
            now.getTime() - session.lastUsedAt.getTime() >=
            LAST_USED_WRITE_INTERVAL_MS
              ? now
              : session.lastUsedAt,
          idleExpiresAt: session.idleExpiresAt,
          absoluteExpiresAt: session.absoluteExpiresAt,
          mfaVerifiedAt: session.mfaVerifiedAt,
          mfaAcr: session.mfaAcr,
          mfaAmr: session.mfaAmr,
          activeMembershipCount,
          activeTenantId,
          activeMembershipId,
          contextVersion,
        };
      },
    );
  }

  toView(session: AuthenticatedSession): AuthSessionView {
    return {
      authenticated: true,
      user: {
        id: session.userId,
        status: session.userStatus,
        locale: session.userLocale,
      },
      session: {
        issuedAt: session.issuedAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        idleExpiresAt: session.idleExpiresAt.toISOString(),
        absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
      },
      activeMembershipCount: session.activeMembershipCount,
      tenantContext:
        session.activeTenantId && session.activeMembershipId
          ? {
              tenantId: session.activeTenantId,
              membershipId: session.activeMembershipId,
              contextVersion: session.contextVersion,
            }
          : null,
    };
  }

  async getCsrfToken(sessionId: string): Promise<string | null> {
    const session = await this.prisma.withGlobalOperationContext(
      randomUUID(),
      (transaction) =>
        transaction.appSession.findUnique({ where: { id: sessionId } }),
    );
    if (
      !session ||
      session.status !== 'ACTIVE' ||
      !session.csrfTokenCiphertext
    ) {
      return null;
    }
    try {
      return this.crypto.decrypt(session.csrfTokenCiphertext);
    } catch {
      return null;
    }
  }

  async transitionUserStatus(
    userId: string,
    status: UserStatus,
  ): Promise<{ status: UserStatus; revokedSessionCount: number }> {
    const now = new Date();
    return this.prisma.withGlobalOperationContext(
      randomUUID(),
      async (transaction) => {
        const previous = await transaction.user.findUnique({
          where: { id: userId },
        });
        const user = await transaction.user.update({
          where: { id: userId },
          data: { status },
        });
        const revokedSessionCount = isLoginAllowed(status)
          ? 0
          : await revokeActiveSessionsInTransaction(
              transaction,
              userId,
              'account_status',
              now,
            );
        if (!isLoginAllowed(status)) {
          await this.audit.recordInTransaction(
            {
              eventType: identityEventType(status),
              category: 'SECURITY',
              outcome: 'REVOKED',
              targetType: 'User',
              targetId: userId,
              policy: 'AccountLifecycle',
              reasonCode: 'account_status',
              correlationId: randomUUID(),
              metadata: {
                fromStatus: previous?.status ?? null,
                toStatus: status,
                revokedSessionCount,
              },
            },
            transaction,
          );
        }
        return { status: user.status, revokedSessionCount };
      },
    );
  }

  async revokeByCookie(cookieValue: string, reason: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(cookieValue)) return false;
    const tokenHash = this.crypto.hash(cookieValue);
    const session = await this.prisma.withGlobalOperationContext(
      randomUUID(),
      (transaction) =>
        transaction.appSession.findUnique({ where: { tokenHash } }),
    );
    if (!session || session.status !== 'ACTIVE') return false;
    if (session.providerRefreshTokenCiphertext) {
      try {
        const refreshToken = this.crypto.decrypt(
          session.providerRefreshTokenCiphertext,
        );
        await this.oidc.revokeRefreshToken(refreshToken);
      } catch {
        // Application-session revocation remains mandatory even if provider
        // token material is unavailable or fails authenticated decryption.
      }
    }
    await this.prisma.withGlobalOperationContext(
      randomUUID(),
      async (transaction) => {
        const revokedAt = new Date();
        const updated = await transaction.appSession.updateMany({
          where: { id: session.id, status: 'ACTIVE' },
          data: {
            status: 'REVOKED',
            revokedAt,
            revokedReason: reason.slice(0, 128),
            providerRefreshTokenCiphertext: null,
            csrfTokenCiphertext: null,
          },
        });
        if (updated.count !== 1) return;
        await this.audit.recordInTransaction(
          {
            eventType: 'auth.logout',
            category: 'AUDIT',
            outcome: 'REVOKED',
            actorUserId: session.userId,
            targetType: 'AppSession',
            targetId: session.id,
            policy: 'SessionLifecycle',
            reasonCode: reason.slice(0, 128),
            correlationId: randomUUID(),
            metadata: {},
          },
          transaction,
        );
      },
    );
    return true;
  }

  async refreshByCookie(cookieValue: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(cookieValue)) return false;
    const tokenHash = this.crypto.hash(cookieValue);
    const session = await this.prisma.withGlobalOperationContext(
      randomUUID(),
      (transaction) =>
        transaction.appSession.findUnique({
          where: { tokenHash },
          include: { user: true },
        }),
    );
    if (!session || session.status !== 'ACTIVE') {
      return false;
    }
    if (!isLoginAllowed(session.user.status)) {
      await this.prisma.withGlobalOperationContext(
        randomUUID(),
        (transaction) =>
          revokeActiveSessionsInTransaction(
            transaction,
            session.userId,
            'account_status',
            new Date(),
          ),
      );
      return false;
    }
    if (!session.providerRefreshTokenCiphertext) {
      return false;
    }
    const now = new Date();
    if (session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) {
      await this.prisma.withGlobalOperationContext(
        randomUUID(),
        async (transaction) => {
          const updated = await transaction.appSession.updateMany({
            where: { id: session.id, status: 'ACTIVE', tokenHash },
            data: {
              status: 'EXPIRED',
              revokedAt: now,
              revokedReason: 'expired',
              providerRefreshTokenCiphertext: null,
              csrfTokenCiphertext: null,
            },
          });
          if (updated.count !== 1) return;
          await this.audit.recordInTransaction(
            {
              eventType: 'auth.session.revoked',
              category: 'SECURITY',
              outcome: 'REVOKED',
              actorUserId: session.userId,
              targetType: 'AppSession',
              targetId: session.id,
              policy: 'SessionLifecycle',
              reasonCode: 'expired',
              correlationId: randomUUID(),
              metadata: {},
            },
            transaction,
          );
        },
      );
      return false;
    }
    try {
      const refreshToken = this.crypto.decrypt(
        session.providerRefreshTokenCiphertext,
      );
      const tokens = await this.oidc.refreshToken(refreshToken);
      const updated = await this.prisma.withGlobalOperationContext(
        randomUUID(),
        (transaction) =>
          transaction.appSession.updateMany({
            where: { id: session.id, status: 'ACTIVE', tokenHash },
            data: {
              providerRefreshTokenCiphertext: tokens.refresh_token
                ? this.crypto.encrypt(tokens.refresh_token)
                : session.providerRefreshTokenCiphertext,
              lastUsedAt: new Date(),
            },
          }),
      );
      if (updated.count !== 1) {
        throw new Error('Session refresh update was not applied');
      }
      return true;
    } catch {
      await this.prisma.withGlobalOperationContext(
        randomUUID(),
        async (transaction) => {
          const revokedAt = new Date();
          const updated = await transaction.appSession.updateMany({
            where: { id: session.id, status: 'ACTIVE', tokenHash },
            data: {
              status: 'REVOKED',
              revokedAt,
              revokedReason: 'provider_refresh_failed',
              providerRefreshTokenCiphertext: null,
              csrfTokenCiphertext: null,
            },
          });
          if (updated.count !== 1) return;
          await this.audit.recordInTransaction(
            {
              eventType: 'auth.session.refresh_failed',
              category: 'SECURITY',
              outcome: 'REVOKED',
              actorUserId: session.userId,
              targetType: 'AppSession',
              targetId: session.id,
              policy: 'SessionLifecycle',
              reasonCode: 'provider_refresh_failed',
              correlationId: randomUUID(),
              metadata: {},
            },
            transaction,
          );
        },
      );
      return false;
    }
  }

  private async resolveOrCreateUserIdInTransaction(
    transaction: Prisma.TransactionClient,
    claims: OidcIdentityClaims,
    provider: string,
    email: string | undefined,
  ): Promise<string> {
    const identity = await transaction.externalIdentity.findUnique({
      where: { provider_subject: { provider, subject: claims.sub } },
    });
    if (identity) {
      await transaction.externalIdentity.update({
        where: { id: identity.id },
        data: {
          providerSessionId: claims.sid,
          lastAuthenticatedAt: new Date(),
        },
      });
      return identity.userId;
    }
    if (email) {
      const conflicting = await transaction.user.findUnique({
        where: { emailNormalized: email },
        select: { id: true },
      });
      if (conflicting) throw new AuthenticationError('AUTHENTICATION_FAILED');
    }
    const user = await transaction.user.create({
      data: {
        status: UserStatus.PENDING,
        emailNormalized: email,
        displayName: claims.name,
        givenName: claims.given_name,
        familyName: claims.family_name,
        locale: claims.locale === 'ar' ? 'ar' : 'en',
        externalIdentities: {
          create: {
            provider,
            subject: claims.sub,
            providerSessionId: claims.sid,
            lastAuthenticatedAt: new Date(),
          },
        },
      },
    });
    return user.id;
  }
}

function normalizeEmail(
  email: string | undefined,
  verified: boolean | undefined,
): string | undefined {
  if (!email || verified !== true) return undefined;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 && normalized.length <= 320
    ? normalized
    : undefined;
}

function identityEventType(
  status: UserStatus,
): 'identity.suspended' | 'identity.disabled' | 'identity.deleted' {
  if (status === UserStatus.SUSPENDED) return 'identity.suspended';
  if (status === UserStatus.DISABLED) return 'identity.disabled';
  if (status === UserStatus.DELETED) return 'identity.deleted';
  throw new Error('Account lifecycle audit event requires a blocked status');
}

function isLoginAllowed(status: UserStatus): boolean {
  return status === UserStatus.PENDING || status === UserStatus.ACTIVE;
}

async function revokeActiveSessionsInTransaction(
  transaction: Prisma.TransactionClient,
  userId: string,
  reason: string,
  revokedAt: Date,
): Promise<number> {
  const result = await transaction.appSession.updateMany({
    where: { userId, status: 'ACTIVE' },
    data: {
      status: 'REVOKED',
      revokedAt,
      revokedReason: reason.slice(0, 128),
      providerRefreshTokenCiphertext: null,
      csrfTokenCiphertext: null,
    },
  });
  return result.count;
}

function isMembershipCurrentlyEligible(
  membership: {
    userId: string;
    status: string;
    activeFrom: Date | null;
    activeUntil: Date | null;
    tenant: { status: string };
  } | null,
  now: Date,
  userStatus: UserStatus,
): boolean {
  return (
    userStatus === UserStatus.ACTIVE &&
    membership !== null &&
    membership.status === 'ACTIVE' &&
    (membership.activeFrom === null || membership.activeFrom <= now) &&
    (membership.activeUntil === null || membership.activeUntil >= now) &&
    membership.tenant.status === 'ACTIVE'
  );
}

async function countActiveMemberships(
  transaction: Prisma.TransactionClient,
  userId: string,
  now: Date,
): Promise<number> {
  return transaction.membership.count({
    where: {
      userId,
      status: 'ACTIVE',
      tenant: { status: 'ACTIVE' },
      OR: [{ activeFrom: null }, { activeFrom: { lte: now } }],
      AND: [{ OR: [{ activeUntil: null }, { activeUntil: { gte: now } }] }],
    },
  });
}
