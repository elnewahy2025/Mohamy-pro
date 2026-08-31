import { Injectable } from '@nestjs/common';
import { type AuditCategory, type AuditOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import {
  AUDIT_CATEGORY,
  AUDIT_EVENT_VERSIONS,
  type AuditEventType,
} from './audit-constants';
import { AuditWriteError } from './audit.errors';

export interface AuditEventInput {
  eventType: AuditEventType;
  outcome?: AuditOutcome;
  actorUserId?: string | null;
  actorMembershipId?: string | null;
  tenantId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  policy?: string | null;
  reasonCode?: string | null;
  correlationId: string;
  traceId?: string | null;
  ipHash?: string | null;
  userAgentHash?: string | null;
  metadata?: Record<string, unknown>;
}

const RETENTION_YEARS = 7;

const MAX_METADATA_BYTES = 16 * 1024;

// Per-event-type allowlist of safe metadata keys. A key absent from the
// allowlist is rejected, so an unknown or sensitive field cannot be persisted.
const METADATA_ALLOWLIST: Partial<Record<string, string[]>> = {
  'tenant.switch.succeeded': ['sourceTenantId'],
  'tenant.switch.denied': ['sourceTenantId', 'targetTenantId'],
  'tenant.bootstrap.succeeded': ['tenantSlug', 'organizationSlug'],
  'tenant.bootstrap.denied': ['reason'],
  'auth.login.start': [],
  'auth.login.succeeded': [],
  'auth.login.denied': ['reason'],
  'auth.logout': [],
  'membership.invited': ['roleKeysCount', 'expiresAtIso'],
  'membership.accepted': ['roleKeysCount'],
  'membership.suspended': ['reason'],
  'membership.reinstated': ['reason'],
  'membership.expired': [],
  'membership.removed': ['reason'],
  'invitation.revoked': ['reason'],
  'role.assigned': ['roleKey'],
  'permission.denied': ['permissionKey'],
  'auth.rate.limited': ['reason'],
  'auth.account.locked': ['reason'],
  'auth.account.lock.released': [],
  'mfa.rate.limited': ['reason'],
  'tenant.switch.rate.limited': ['reason', 'sourceTenantId', 'targetTenantId'],
  'invitation.rate.limited': ['reason'],
};

@Injectable()
export class AuditEventService {
  constructor(private readonly prisma: PrismaService) {}

  async write(
    input: AuditEventInput,
    transaction?: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    const client = transaction ?? this.prisma;
    const category: AuditCategory = AUDIT_CATEGORY[input.eventType];
    const eventVersion = AUDIT_EVENT_VERSIONS[input.eventType];
    const metadata = this.sanitizeMetadata(input.eventType, input.metadata);
    const retentionUntil = new Date(
      Date.now() + RETENTION_YEARS * 365 * 24 * 60 * 60 * 1000,
    );
    try {
      const event = await client.auditEvent.create({
        data: {
          eventType: input.eventType,
          eventVersion,
          category,
          outcome: input.outcome ?? 'SUCCEEDED',
          actorUserId: input.actorUserId ?? null,
          actorMembershipId: input.actorMembershipId ?? null,
          tenantId: input.tenantId ?? null,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          policy: input.policy ?? null,
          reasonCode: input.reasonCode ?? null,
          correlationId: input.correlationId,
          traceId: input.traceId ?? null,
          ipHash: input.ipHash ?? null,
          userAgentHash: input.userAgentHash ?? null,
          metadata: metadata as Prisma.InputJsonValue,
          retentionUntil,
        },
      });
      return { id: event.id };
    } catch (error) {
      throw new AuditWriteError(
        error instanceof Error ? error.message : 'Audit event write failed',
      );
    }
  }

  private sanitizeMetadata(
    eventType: AuditEventType,
    metadata?: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!metadata || Object.keys(metadata).length === 0) {
      return {};
    }
    const allowlist = METADATA_ALLOWLIST[eventType] ?? [];
    const sanitized: Record<string, unknown> = {};
    for (const key of Object.keys(metadata)) {
      if (!allowlist.includes(key)) {
        throw new AuditWriteError(
          `Metadata field '${key}' is not allowlisted for '${eventType}'`,
        );
      }
      const value = metadata[key];
      if (value !== undefined) {
        this.assertScalarValue(key, value);
        sanitized[key] = value;
      }
    }
    const bytes = Buffer.byteLength(JSON.stringify(sanitized));
    if (bytes > MAX_METADATA_BYTES) {
      throw new AuditWriteError('Audit event metadata exceeds size limit');
    }
    return sanitized;
  }

  private assertScalarValue(key: string, value: unknown): void {
    if (value === null) return;
    if (typeof value === 'string') {
      if (value.length <= 256) return;
      throw new AuditWriteError(`Metadata field '${key}' exceeds length limit`);
    }
    if (typeof value === 'number') {
      if (Number.isFinite(value)) return;
      throw new AuditWriteError(
        `Metadata field '${key}' is not a finite number`,
      );
    }
    if (typeof value === 'boolean') return;
    if (Array.isArray(value) || typeof value === 'object') {
      throw new AuditWriteError(
        `Metadata field '${key}' must be a scalar value`,
      );
    }
    throw new AuditWriteError(
      `Metadata field '${key}' has an unsupported type`,
    );
  }
}
