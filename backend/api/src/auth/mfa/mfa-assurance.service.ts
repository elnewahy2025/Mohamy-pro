import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../../config/env.validation';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MfaStepUpRequiredError } from './mfa.errors';

/**
 * Central staff-sensitive MFA assurance gate. The provider MFA result timestamp
 * is persisted on the application session (mfaVerifiedAt); this service fails
 * closed when it is absent or older than the configured maximum age. It is used
 * by every staff-sensitive operation (membership administration, role/permission
 * administration, Platform Admin and cross-tenant operations, another-user
 * revocation, export/retention) so assurance semantics stay identical.
 */
@Injectable()
export class MfaAssuranceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<ValidatedEnvironment, true>,
  ) {}

  /**
   * Asserts that the given session has a recent verified provider MFA result.
   * Throws MfaStepUpRequiredError when assurance is missing or stale.
   */
  async assertRecentMfa(sessionId: string): Promise<void> {
    const session = await this.prisma.appSession.findUnique({
      where: { id: sessionId },
      select: { mfaVerifiedAt: true },
    });
    if (!session || !session.mfaVerifiedAt) {
      throw new MfaStepUpRequiredError('MFA_REQUIRED');
    }
    const maxAgeSeconds = this.configService.getOrThrow(
      'SENSITIVE_ACTION_MFA_MAX_AGE_SECONDS',
    );
    const maxAgeMs = maxAgeSeconds * 1000;
    if (Date.now() - session.mfaVerifiedAt.getTime() > maxAgeMs) {
      throw new MfaStepUpRequiredError('MFA_STALE');
    }
  }
}
