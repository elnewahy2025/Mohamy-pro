import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../config/env.validation';

export interface BootstrapConfig {
  subject: string;
  secret: string;
  tenantSlug: string;
  tenantName: string;
  organizationSlug: string;
  organizationName: string;
  mfaMaxAgeSeconds: number;
}

/**
 * Loads the environment-only Platform bootstrap configuration. If any required
 * BOOTSTRAP_* value is absent the config is considered unset and the endpoint
 * fails closed at runtime; the config never falls back to a default that would
 * weaken the one-time operator gate.
 */
@Injectable()
export class BootstrapConfigService {
  constructor(
    private readonly configService: ConfigService<ValidatedEnvironment, true>,
  ) {}

  load(): BootstrapConfig | null {
    const subject = this.read('BOOTSTRAP_SUBJECT');
    const secret = this.read('BOOTSTRAP_SECRET');
    const tenantSlug = this.read('BOOTSTRAP_TENANT_SLUG');
    const tenantName = this.read('BOOTSTRAP_TENANT_NAME');
    const organizationSlug = this.read('BOOTSTRAP_ORG_SLUG');
    const organizationName = this.read('BOOTSTRAP_ORG_NAME');
    if (
      !subject ||
      !secret ||
      !tenantSlug ||
      !tenantName ||
      !organizationSlug ||
      !organizationName
    ) {
      return null;
    }
    return {
      subject,
      secret,
      tenantSlug,
      tenantName,
      organizationSlug,
      organizationName,
      mfaMaxAgeSeconds: this.configService.getOrThrow(
        'BOOTSTRAP_MFA_MAX_AGE_SECONDS',
      ),
    };
  }

  private read(key: keyof ValidatedEnvironment): string | undefined {
    const value = this.configService.get<string>(key as string);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return undefined;
  }
}
