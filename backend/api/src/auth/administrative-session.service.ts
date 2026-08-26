import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { AuditService } from '../infrastructure/audit/audit.service';
import { AuthorizationDeniedError } from '../authorization/authorization.errors';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AdministrativeSessionRevocationInput {
  actorUserId: string;
  targetUserId: string;
}

export interface AdministrativeSessionRevocationResult {
  revokedSessionCount: number;
}

@Injectable()
export class AdministrativeSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async revokeAllForUser(
    input: AdministrativeSessionRevocationInput,
  ): Promise<AdministrativeSessionRevocationResult> {
    if (
      !UUID_V4_PATTERN.test(input.actorUserId) ||
      !UUID_V4_PATTERN.test(input.targetUserId) ||
      input.actorUserId === input.targetUserId
    ) {
      throw new AuthorizationDeniedError();
    }

    return this.prisma.withGlobalOperationContext(
      randomUUID(),
      async (transaction) => {
        const target = await transaction.user.findUnique({
          where: { id: input.targetUserId },
          select: { id: true },
        });
        if (!target) throw new AuthorizationDeniedError();

        const revokedAt = new Date();
        const updated = await transaction.appSession.updateMany({
          where: {
            userId: input.targetUserId,
            status: 'ACTIVE',
          },
          data: {
            status: 'REVOKED',
            revokedAt,
            revokedReason: 'administrative_session_revocation',
            providerRefreshTokenCiphertext: null,
            csrfTokenCiphertext: null,
          },
        });
        await this.audit.recordInTransaction(
          {
            eventType: 'auth.session.revoked',
            category: 'SECURITY',
            outcome: 'REVOKED',
            actorUserId: input.actorUserId,
            targetType: 'User',
            targetId: input.targetUserId,
            policy: 'CanPerformPlatformOperation',
            reasonCode: 'administrative_session_revocation',
            correlationId: randomUUID(),
            metadata: { revokedSessionCount: updated.count },
          },
          transaction,
        );
        return { revokedSessionCount: updated.count };
      },
    );
  }
}
