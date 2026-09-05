import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { ResourceAccessService } from './resource-access.service';

@Global()
@Module({
  providers: [PermissionsService, ResourceAccessService],
  exports: [PermissionsService, ResourceAccessService],
})
export class PermissionsModule {}
