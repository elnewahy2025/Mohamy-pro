import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IntegrationsInvalidStateError } from './integrations.errors';
import { INTEGRATION_KEYS, type SetIntegrationDto } from './integrations.dto';

const SECRET_LIKE =
  /secret|token|password|credential|private|auth|api[_-]?key|access[_-]?key/i;

export interface IntegrationHealth {
  key: string;
  enabled: boolean;
  status: string;
  errorMessage: string | null;
  updatedAt: string | null;
}

@Injectable()
export class RegistryService {
  private validateConfig(config?: Record<string, string>): void {
    if (!config) return;
    const entries = Object.entries(config);
    if (entries.length > 20) {
      throw new IntegrationsInvalidStateError(
        'Integration config holds at most 20 keys',
      );
    }
    for (const [key, value] of entries) {
      if (SECRET_LIKE.test(key)) {
        throw new IntegrationsInvalidStateError(
          `Config key not allowed (secrets belong in Vault): ${key}`,
        );
      }
      if (typeof value !== 'string' || value.length > 500) {
        throw new IntegrationsInvalidStateError(
          `Config value for ${key} must be a string of at most 500 chars`,
        );
      }
    }
  }

  async set(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    key: string,
    dto: SetIntegrationDto,
  ) {
    if (!INTEGRATION_KEYS.includes(key as never)) {
      throw new IntegrationsInvalidStateError('Unknown integration key');
    }
    this.validateConfig(dto.config);
    return tx.integration.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: {
        tenantId,
        key,
        enabled: dto.enabled,
        config: dto.config ?? {},
        status: dto.enabled ? 'ENABLED' : 'DISABLED',
        enabledBy: dto.enabled ? userId : null,
      },
      update: {
        enabled: dto.enabled,
        config: dto.config ?? {},
        status: dto.enabled ? 'ENABLED' : 'DISABLED',
        errorMessage: null,
        enabledBy: dto.enabled ? userId : null,
      },
    });
  }

  async list(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.integration.findMany({
      where: { tenantId },
      orderBy: { key: 'asc' },
      take: 100,
    });
  }

  async health(tx: Prisma.TransactionClient, tenantId: string) {
    const rows = await this.list(tx, tenantId);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return INTEGRATION_KEYS.map((key): IntegrationHealth => {
      const row = byKey.get(key);
      return {
        key,
        enabled: row?.enabled ?? false,
        status: row?.status ?? 'DISABLED',
        errorMessage: row?.errorMessage ?? null,
        updatedAt: row ? row.updatedAt.toISOString() : null,
      };
    });
  }
}
