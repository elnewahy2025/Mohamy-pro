import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../config/env.validation';
import type { AuthorizationSubject } from './authorization.types';

export type MfaAssuranceFailure =
  | 'missing_timestamp'
  | 'future_timestamp'
  | 'stale_timestamp'
  | 'required_amr_missing'
  | 'required_acr_mismatch';

export interface MfaAssuranceResult {
  satisfied: boolean;
  reason?: MfaAssuranceFailure;
}

@Injectable()
export class MfaAssuranceService {
  constructor(
    private readonly config: ConfigService<ValidatedEnvironment, true>,
  ) {}

  evaluate(
    session: AuthorizationSubject,
    now = new Date(),
  ): MfaAssuranceResult {
    const verifiedAt = session.mfaVerifiedAt;
    if (!verifiedAt) {
      return { satisfied: false, reason: 'missing_timestamp' };
    }
    const ageMs = now.getTime() - verifiedAt.getTime();
    if (ageMs < 0) {
      return { satisfied: false, reason: 'future_timestamp' };
    }
    const maxAgeMs =
      this.config.getOrThrow<number>('MFA_MAX_AGE_SECONDS') * 1_000;
    if (ageMs > maxAgeMs) {
      return { satisfied: false, reason: 'stale_timestamp' };
    }

    const amr = Array.isArray(session.mfaAmr)
      ? session.mfaAmr.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const requiredAmr = this.config.getOrThrow<string>('MFA_REQUIRED_AMR');
    if (!amr.includes(requiredAmr)) {
      return { satisfied: false, reason: 'required_amr_missing' };
    }

    const requiredAcr = this.config.get<string>('MFA_REQUIRED_ACR');
    if (requiredAcr && session.mfaAcr !== requiredAcr) {
      return { satisfied: false, reason: 'required_acr_mismatch' };
    }

    return { satisfied: true };
  }
}
