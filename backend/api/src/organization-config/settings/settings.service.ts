import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { AuditEventService } from '../../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../../audit/audit-constants';
import { hashToken } from '../../auth/session/session-crypto';
import { getCorrelationId } from '../../common/middleware/correlation-id.middleware';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  PERMISSION_KEYS,
  type PermissionKey,
} from '../../permissions/permission.constants';
import { PermissionsService } from '../../permissions/permissions.service';
import { OrganizationConfigDeniedError } from '../organization-config.errors';

export interface SetOrganizationSettingInput {
  key: string;
  value: unknown;
}

export interface SetOrganizationSettingResult {
  id: string;
  tenantId: string;
  key: string;
  version: number;
  created: boolean;
}

const TENANT_PERMISSION: PermissionKey =
  PERMISSION_KEYS.CAN_MANAGE_ORGANIZATION_CONFIG;

/**
 * Tenant-scoped settings engine. Each value is stored as versioned JSON under
 * a namespaced key so configuration (case types, branding, locale, numbering,
 * feature flags, etc.) can be introduced without code changes. Mutations are
 * permission-guarded and emit an audit event atomically with the value write.
 */
@Injectable()
export class OrganizationSettingsService {
  private readonly logger = new Logger(OrganizationSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditEventService,
    private readonly permissions: PermissionsService,
  ) {}

  async set(
    request: Request,
    input: SetOrganizationSettingInput,
  ): Promise<SetOrganizationSettingResult> {
    const auth = request.auth;
    if (!auth) {
      throw new OrganizationConfigDeniedError('UNAUTHENTICATED');
    }
    const { sessionId, userId, activeTenantId } = auth;
    const correlationId = getCorrelationId(request);
    if (!activeTenantId) {
      throw new OrganizationConfigDeniedError('TENANT_CONTEXT_REQUIRED');
    }
    const tenantId = activeTenantId;

    const { membershipId: actorMembershipId } =
      await this.permissions.assertTenantPermission({
        request,
        userId,
        tenantId,
        permissionKey: TENANT_PERMISSION,
        operationId: sessionId,
      });

    let result: SetOrganizationSettingResult;
    try {
      result = await this.prisma.withTenantContext(
        {
          tenantId,
          userId,
          membershipId: actorMembershipId,
          operationId: sessionId,
        },
        async (transaction) => {
          const existing = await transaction.organizationSetting.findUnique({
            where: { tenantId_key: { tenantId, key: input.key } },
            select: { id: true, version: true },
          });
          const nextVersion = (existing?.version ?? 0) + 1;
          const updated = await transaction.organizationSetting.upsert({
            where: { tenantId_key: { tenantId, key: input.key } },
            create: {
              tenantId,
              key: input.key,
              value: input.value as Prisma.InputJsonValue,
              status: 'ACTIVE',
              version: 1,
              updatedByMembershipId: actorMembershipId,
            },
            update: {
              value: input.value as Prisma.InputJsonValue,
              status: 'ACTIVE',
              version: nextVersion,
              updatedByMembershipId: actorMembershipId,
            },
          });

          await this.audit.write(
            {
              eventType: AUDIT_EVENT_TYPES.ORGANIZATION_SETTING_SET,
              outcome: 'SUCCEEDED',
              actorUserId: userId,
              actorMembershipId: actorMembershipId,
              tenantId,
              targetType: 'OrganizationSetting',
              targetId: updated.id,
              policy: TENANT_PERMISSION,
              correlationId,
              ipHash: this.optionalHash(request.ip),
              userAgentHash: this.optionalHash(request.headers['user-agent']),
              metadata: {
                key: input.key,
                version: nextVersion,
              },
            },
            transaction,
          );
          return {
            id: updated.id,
            tenantId,
            key: updated.key,
            version: updated.version,
            created: !existing,
          };
        },
      );
    } catch (error) {
      if (error instanceof OrganizationConfigDeniedError) throw error;
      this.logger.warn({
        message: 'Organization setting write failed',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    return result;
  }

  private optionalHash(value: string | string[] | undefined): string | null {
    if (!value) return null;
    const raw = Array.isArray(value) ? value.join(',') : value;
    return raw.length === 0 ? null : hashToken(raw);
  }
}
