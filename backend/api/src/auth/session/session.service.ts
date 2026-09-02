import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipStatus, SessionStatus, UserStatus } from '@prisma/client';
import type { ValidatedEnvironment } from '../../config/env.validation';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AUTH_PROVIDER } from '../auth.constants';
import {
  SessionNotFoundError,
  SessionNotAuthenticatedError,
} from '../auth.errors';
import type { OidcProfile, OidcTokens } from '../auth.types';
import {
  constantTimeEqual,
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
  hashToken,
} from './session-crypto';

const LAST_USED_THROTTLE_MS = 5 * 60 * 1_000;

export interface SessionDetails {
  sessionId: string;
  userId: string;
  provider: string;
  providerSubject: string;
  activeTenantId: string | null;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<ValidatedEnvironment, true>,
  ) {}

  private sessionSecret(): string {
    return this.configService.getOrThrow('SESSION_SECRET');
  }

  private idleTtlSeconds(): number {
    return this.configService.getOrThrow('SESSION_IDLE_TTL_SECONDS');
  }

  private absoluteTtlSeconds(): number {
    return this.configService.getOrThrow('SESSION_ABSOLUTE_TTL_SECONDS');
  }

  async createSession(input: {
    user: { id: string; status: UserStatus };
    profile: OidcProfile;
    tokens: OidcTokens;
    userAgent?: string;
    ip?: string;
  }): Promise<{
    token: string;
    details: SessionDetails;
    maxAgeSeconds: number;
  }> {
    const { user, profile, tokens, userAgent, ip } = input;
    const token = generateOpaqueToken();
    const csrfToken = generateOpaqueToken();
    const now = new Date();
    const idleTtl = this.idleTtlSeconds();
    const absoluteTtl = this.absoluteTtlSeconds();

    const refreshCiphertext = tokens.refreshToken
      ? encryptSecret(this.sessionSecret(), tokens.refreshToken)
      : null;
    const idTokenCiphertext = tokens.idToken
      ? encryptSecret(this.sessionSecret(), tokens.idToken)
      : null;

    const activeMemberships = await this.prisma.membership.findMany({
      where: {
        userId: user.id,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true, tenantId: true },
      take: 2,
    });
    const defaultMembership =
      activeMemberships.length === 1 ? activeMemberships[0] : null;

    const session = await this.prisma.appSession.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        csrfTokenHash: hashToken(csrfToken),
        status: SessionStatus.ACTIVE,
        provider: AUTH_PROVIDER,
        providerSubject: profile.subject,
        providerSessionId: profile.providerSessionId ?? null,
        providerRefreshTokenCiphertext: refreshCiphertext,
        providerRefreshTokenKeyVersion: refreshCiphertext ? 'v1' : null,
        providerIdTokenCiphertext: idTokenCiphertext,
        activeTenantId: defaultMembership?.tenantId ?? null,
        activeMembershipId: defaultMembership?.id ?? null,
        idleExpiresAt: new Date(now.getTime() + idleTtl * 1000),
        absoluteExpiresAt: new Date(now.getTime() + absoluteTtl * 1000),
        userAgentHash: userAgent ? hashToken(userAgent) : null,
        ipHash: ip ? hashToken(ip) : null,
      },
    });

    return {
      token,
      maxAgeSeconds: absoluteTtl,
      details: {
        sessionId: session.id,
        userId: user.id,
        provider: session.provider,
        providerSubject: session.providerSubject,
        activeTenantId: session.activeTenantId,
      },
    };
  }

  async validateSession(token: string): Promise<SessionDetails> {
    const session = await this.prisma.appSession.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!session) {
      throw new SessionNotFoundError();
    }
    const now = new Date();
    if (session.status !== SessionStatus.ACTIVE) {
      throw new SessionNotAuthenticatedError('Session is not active');
    }
    if (session.absoluteExpiresAt <= now || session.idleExpiresAt <= now) {
      await this.prisma.appSession.update({
        where: { id: session.id },
        data: { status: SessionStatus.EXPIRED },
      });
      throw new SessionNotAuthenticatedError('Session has expired');
    }

    const userStatus = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { status: true },
    });
    if (!userStatus || (userStatus.status !== 'ACTIVE' && userStatus.status !== 'PENDING')) {
      throw new SessionNotAuthenticatedError('Account is not active');
    }

    if (now.getTime() - session.lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS) {
      // Sliding idle window: push the idle deadline forward (while keeping the
      // fixed absolute ceiling) together with the throttled lastUsedAt refresh,
      // so an actively-used session does not expire on its creation-time idle TTL.
      const idleTtl = this.idleTtlSeconds();
      await this.prisma.appSession.update({
        where: { id: session.id },
        data: {
          lastUsedAt: now,
          idleExpiresAt: new Date(now.getTime() + idleTtl * 1000),
        },
      });
    }

    return {
      sessionId: session.id,
      userId: session.userId,
      provider: session.provider,
      providerSubject: session.providerSubject,
      activeTenantId: session.activeTenantId,
    };
  }

  async revokeSession(sessionId: string, reason = 'logout'): Promise<void> {
    await this.prisma.appSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.REVOKED,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  async getRefreshToken(sessionId: string): Promise<string | null> {
    const session = await this.prisma.appSession.findUnique({
      where: { id: sessionId },
    });
    if (!session?.providerRefreshTokenCiphertext) return null;
    return decryptSecret(
      this.sessionSecret(),
      session.providerRefreshTokenCiphertext,
    );
  }

  async getIdToken(sessionId: string): Promise<string | null> {
    const session = await this.prisma.appSession.findUnique({
      where: { id: sessionId },
    });
    if (!session?.providerIdTokenCiphertext) return null;
    return decryptSecret(
      this.sessionSecret(),
      session.providerIdTokenCiphertext,
    );
  }

  async rotateRefreshToken(
    sessionId: string,
    refreshToken: string | null,
  ): Promise<void> {
    const ciphertext = refreshToken
      ? encryptSecret(this.sessionSecret(), refreshToken)
      : null;
    await this.prisma.appSession.update({
      where: { id: sessionId },
      data: {
        providerRefreshTokenCiphertext: ciphertext,
        providerRefreshTokenKeyVersion: ciphertext ? 'v1' : null,
      },
    });
  }

  async updateActiveTenant(
    sessionId: string,
    tenantId: string,
    membershipId: string,
  ): Promise<void> {
    await this.prisma.appSession.update({
      where: { id: sessionId },
      data: {
        activeTenantId: tenantId,
        activeMembershipId: membershipId,
        contextVersion: { increment: 1 },
      },
    });
  }

  async verifyCsrf(sessionId: string, candidate: string): Promise<boolean> {
    const session = await this.prisma.appSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) return false;
    return constantTimeEqual(session.csrfTokenHash, hashToken(candidate));
  }

  private async readCsrfToken(sessionId: string): Promise<string> {
    const csrfToken = generateOpaqueToken();
    await this.prisma.appSession.update({
      where: { id: sessionId },
      data: { csrfTokenHash: hashToken(csrfToken) },
    });
    return csrfToken;
  }

  async issueCsrfToken(sessionId: string): Promise<string> {
    return this.readCsrfToken(sessionId);
  }
}
