import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { AuditEventService } from '../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { getCorrelationId } from '../common/middleware/correlation-id.middleware';
import { PermissionsService } from '../permissions/permissions.service';
import { PERMISSION_KEYS } from '../permissions/permission.constants';
import { InvitationService } from '../membership/invitation/invitation.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { ProvisioningDeniedError } from './provisioning.errors';
import type { ProvisionUserDto } from './provisioning.dto';

export interface ProvisionUserResult {
  providerSubject: string;
  invitationId: string;
  expiresAt: string;
}

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly permissions: PermissionsService,
    private readonly invitations: InvitationService,
    private readonly keycloak: KeycloakAdminService,
    private readonly audit: AuditEventService,
  ) {}

  async provision(
    request: Request,
    dto: ProvisionUserDto,
  ): Promise<ProvisionUserResult> {
    const auth = request.auth;
    if (!auth) throw new ProvisioningDeniedError('UNAUTHENTICATED', 401);
    if (!auth.activeTenantId) {
      throw new ProvisioningDeniedError('TENANT_CONTEXT_REQUIRED');
    }
    const { membershipId } = await this.permissions.assertTenantPermission({
      request,
      userId: auth.userId,
      tenantId: auth.activeTenantId,
      permissionKey: PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP,
      operationId: auth.sessionId,
    });

    const username = dto.username ?? dto.email.split('@')[0];
    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
      throw new ProvisioningDeniedError('USERNAME_DERIVATION_FAILED', 400);
    }
    const { id: providerSubject } = await this.keycloak.createUser({
      email: dto.email,
      username,
      firstName: dto.firstName,
      lastName: dto.lastName,
      password: dto.password,
      temporary: dto.temporaryPassword ?? true,
    });

    try {
      const invitation = await this.invitations.create(request, {
        intendedEmail: dto.email,
        intendedProviderSubject: providerSubject,
        requestedRoleKeys: dto.roleKeys,
      });
      await this.audit.write({
        eventType: AUDIT_EVENT_TYPES.USER_PROVISIONED,
        outcome: 'SUCCEEDED',
        actorUserId: auth.userId,
        actorMembershipId: membershipId,
        tenantId: auth.activeTenantId,
        targetType: 'invitation',
        targetId: invitation.invitationId,
        policy: PERMISSION_KEYS.CAN_MANAGE_MEMBERSHIP,
        correlationId: getCorrelationId(request),
        metadata: { roleKeysCount: String(dto.roleKeys.length) },
      });
      return {
        providerSubject,
        invitationId: invitation.invitationId,
        expiresAt: invitation.expiresAt.toISOString(),
      };
    } catch (error) {
      await this.keycloak.deleteUser(providerSubject).catch(() => undefined);
      this.logger.warn({
        message: 'User provisioning rolled back at the provider',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
