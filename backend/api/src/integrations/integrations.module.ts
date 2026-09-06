import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsOperations } from './integrations.operations';
import { RegistryService } from './registry.service';
import { WebhookService } from './webhook.service';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule, AuthModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsOperations, RegistryService, WebhookService],
})
export class IntegrationsModule {}
