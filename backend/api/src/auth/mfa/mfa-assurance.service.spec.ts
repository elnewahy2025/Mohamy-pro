import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../../config/env.validation';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MfaAssuranceService } from './mfa-assurance.service';
import { MfaStepUpRequiredError } from './mfa.errors';

const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const MAX_AGE_SECONDS = 900;

function makeService(input: {
  session: { mfaVerifiedAt: Date | null } | null;
  maxAgeSeconds?: number;
}) {
  const findUnique = jest.fn().mockResolvedValue(input.session);
  const prisma = {
    appSession: { findUnique },
  } as unknown as PrismaService;
  const configService = {
    getOrThrow: jest
      .fn()
      .mockReturnValue(input.maxAgeSeconds ?? MAX_AGE_SECONDS),
  } as unknown as ConfigService<ValidatedEnvironment, true>;
  const service = new MfaAssuranceService(prisma, configService);
  return { service, findUnique };
}

describe('MfaAssuranceService', () => {
  it('accepts a recent verified MFA result', async () => {
    const { service } = makeService({
      session: { mfaVerifiedAt: new Date() },
    });
    await expect(service.assertRecentMfa(SESSION_ID)).resolves.toBeUndefined();
  });

  it('rejects when the session has no verified MFA', async () => {
    const { service } = makeService({
      session: { mfaVerifiedAt: null },
    });
    await expect(service.assertRecentMfa(SESSION_ID)).rejects.toBeInstanceOf(
      MfaStepUpRequiredError,
    );
  });

  it('rejects a stale MFA result older than the max age', async () => {
    const stale = new Date(Date.now() - (MAX_AGE_SECONDS * 1000 + 1));
    const { service } = makeService({ session: { mfaVerifiedAt: stale } });
    await expect(service.assertRecentMfa(SESSION_ID)).rejects.toBeInstanceOf(
      MfaStepUpRequiredError,
    );
  });

  it('rejects when the session is missing entirely', async () => {
    const { service } = makeService({ session: null });
    await expect(service.assertRecentMfa(SESSION_ID)).rejects.toBeInstanceOf(
      MfaStepUpRequiredError,
    );
  });
});
