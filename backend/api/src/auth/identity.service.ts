import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { AUTH_PROVIDER } from './auth.constants';
import type { OidcProfile } from './auth.types';

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveUser(
    profile: OidcProfile,
  ): Promise<{ id: string; status: UserStatus }> {
    const existing = await this.prisma.externalIdentity.findUnique({
      where: {
        provider_subject: { provider: AUTH_PROVIDER, subject: profile.subject },
      },
      include: { user: true },
    });
    if (existing) {
      return { id: existing.userId, status: existing.user.status };
    }
    return this.createUser(profile);
  }

  private async createUser(
    profile: OidcProfile,
  ): Promise<{ id: string; status: UserStatus }> {
    const emailNormalized = profile.email
      ? profile.email.trim().toLowerCase()
      : null;
    return this.prisma.$transaction(async (tx) => {
      let user = emailNormalized
        ? await tx.user.findUnique({ where: { emailNormalized } })
        : null;
      if (!user) {
        user = await tx.user.create({
          data: {
            status: UserStatus.PENDING,
            emailNormalized,
            displayName: profile.displayName ?? null,
            givenName: profile.givenName ?? null,
            familyName: profile.familyName ?? null,
            locale: profile.locale ?? 'en',
          },
        });
      }
      await tx.externalIdentity.create({
        data: {
          userId: user.id,
          provider: AUTH_PROVIDER,
          subject: profile.subject,
          providerSessionId: profile.providerSessionId ?? null,
          lastAuthenticatedAt: new Date(),
        },
      });
      return { id: user.id, status: user.status };
    });
  }
}
