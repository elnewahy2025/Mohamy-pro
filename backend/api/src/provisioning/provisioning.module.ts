import { Module } from '@nestjs/common';
import { ProvisioningController } from './provisioning.controller';
import { ProvisioningService } from './provisioning.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { MembershipModule } from '../membership/membership.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [MembershipModule, PermissionsModule, AuditModule, AuthModule],
  controllers: [ProvisioningController],
  providers: [ProvisioningService, KeycloakAdminService],
})
export class ProvisioningModule {}
