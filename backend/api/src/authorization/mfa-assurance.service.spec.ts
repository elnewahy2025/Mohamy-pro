import { MfaAssuranceService } from './mfa-assurance.service';
import type { AuthorizationSubject } from './authorization.types';

const now = new Date('2026-08-26T10:00:00.000Z');

function createService(overrides: Record<string, unknown> = {}) {
  const values = {
    MFA_REQUIRED_AMR: 'mfa',
    MFA_REQUIRED_ACR: undefined,
    MFA_MAX_AGE_SECONDS: 900,
    ...overrides,
  };
  const config = {
    getOrThrow: jest.fn((key: keyof typeof values) => values[key]),
    get: jest.fn((key: keyof typeof values) => values[key]),
  };
  return new MfaAssuranceService(config as never);
}

function session(
  overrides: Partial<AuthorizationSubject> = {},
): AuthorizationSubject {
  return {
    userId: '11111111-1111-4111-8111-111111111111',
    userStatus: 'ACTIVE',
    activeTenantId: '22222222-2222-4222-8222-222222222222',
    activeMembershipId: '33333333-3333-4333-8333-333333333333',
    mfaVerifiedAt: new Date('2026-08-26T09:50:00.000Z'),
    mfaAcr: 'urn:mohamy:loa:2',
    mfaAmr: ['pwd', 'mfa'],
    ...overrides,
  };
}

describe('MfaAssuranceService', () => {
  it('accepts a recent provider MFA result', () => {
    expect(createService().evaluate(session(), now)).toEqual({
      satisfied: true,
    });
  });

  it.each([
    ['missing timestamp', { mfaVerifiedAt: null }, 'missing_timestamp'],
    [
      'future timestamp',
      { mfaVerifiedAt: new Date('2026-08-26T10:00:01.000Z') },
      'future_timestamp',
    ],
    [
      'stale timestamp',
      { mfaVerifiedAt: new Date('2026-08-26T09:44:59.999Z') },
      'stale_timestamp',
    ],
    ['missing AMR', { mfaAmr: ['pwd'] }, 'required_amr_missing'],
  ] as const)('rejects %s', (_label, overrides, reason) => {
    expect(createService().evaluate(session(overrides), now)).toEqual({
      satisfied: false,
      reason,
    });
  });

  it('requires the configured ACR when configured', () => {
    const service = createService({ MFA_REQUIRED_ACR: 'urn:mohamy:loa:3' });

    expect(service.evaluate(session(), now)).toEqual({
      satisfied: false,
      reason: 'required_acr_mismatch',
    });
  });

  it('accepts an assurance timestamp exactly at the configured maximum age', () => {
    const service = createService();
    const boundary = session({
      mfaVerifiedAt: new Date('2026-08-26T09:45:00.000Z'),
    });

    expect(service.evaluate(boundary, now)).toEqual({ satisfied: true });
  });
});
