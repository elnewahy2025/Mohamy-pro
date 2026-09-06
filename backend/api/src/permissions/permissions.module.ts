import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { ResourceAccessService } from './resource-access.service';
import { AuditModule } from '../audit/audit.module';

@Global()
@Module({
  imports: [AuditModule],
  providers: [PermissionsService, ResourceAccessService],
  exports: [PermissionsService, ResourceAccessService],
})
export class PermissionsModule {}
