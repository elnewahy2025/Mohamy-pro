import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserStatus } from '@prisma/client';
import type { ValidatedEnvironment } from '../config/env.validation';
import { PrismaService } from '../infrastructure/database/prisma.service';
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
    const user = await this.prisma.withGlobalOperationContext(
      randomUUID(),
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
        const activeMembershipCount = await countActiveMemberships(
          transaction,
          userId,
          now,
        );
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
        return {
          sessionId: created.id,
          userId: current.id,
          userStatus: current.status,
          userLocale: current.locale,
          csrfTokenHash: created.csrfTokenHash,
          issuedAt: created.issuedAt,
          lastUsedAt: created.lastUsedAt,
          idleExpiresAt: created.idleExpiresAt,
          absoluteExpiresAt: created.absoluteExpiresAt,
          activeMembershipCount,
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
          await transaction.appSession.update({
            where: { id: session.id },
            data: {
              status: 'REVOKED',
              revokedAt: now,
              revokedReason: 'account_status',
              providerRefreshTokenCiphertext: null,
              csrfTokenCiphertext: null,
            },
          });
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
          return null;
        }
        const activeMembershipCount = await countActiveMemberships(
          transaction,
          session.userId,
          now,
        );
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
          csrfTokenHash: session.csrfTokenHash,
          issuedAt: session.issuedAt,
          lastUsedAt:
            now.getTime() - session.lastUsedAt.getTime() >=
            LAST_USED_WRITE_INTERVAL_MS
              ? now
              : session.lastUsedAt,
          idleExpiresAt: session.idleExpiresAt,
          absoluteExpiresAt: session.absoluteExpiresAt,
          activeMembershipCount,
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
      tenantContext: null,
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
    await this.prisma.withGlobalOperationContext(randomUUID(), (transaction) =>
      transaction.appSession.updateMany({
        where: { id: session.id, status: 'ACTIVE' },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedReason: reason.slice(0, 128),
          providerRefreshTokenCiphertext: null,
          csrfTokenCiphertext: null,
        },
      }),
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
    if (
      !session ||
      session.status !== 'ACTIVE' ||
      !isLoginAllowed(session.user.status) ||
      !session.providerRefreshTokenCiphertext
    ) {
      return false;
    }
    try {
      const refreshToken = this.crypto.decrypt(
        session.providerRefreshTokenCiphertext,
      );
      const tokens = await this.oidc.refreshToken(refreshToken);
      await this.prisma.withGlobalOperationContext(
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
      return true;
    } catch {
      await this.prisma.withGlobalOperationContext(
        randomUUID(),
        (transaction) =>
          transaction.appSession.updateMany({
            where: { id: session.id, status: 'ACTIVE', tokenHash },
            data: {
              status: 'REVOKED',
              revokedAt: new Date(),
              revokedReason: 'provider_refresh_failed',
              providerRefreshTokenCiphertext: null,
              csrfTokenCiphertext: null,
            },
          }),
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

function isLoginAllowed(status: UserStatus): boolean {
  return status === UserStatus.PENDING || status === UserStatus.ACTIVE;
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
