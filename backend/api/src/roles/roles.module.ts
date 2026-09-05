import { Module } from '@nestjs/common';
import { RoleController } from './role.controller';
import { RoleOperations } from './role.operations';
import { RoleService } from './role.service';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule, AuthModule],
  controllers: [RoleController],
  providers: [RoleOperations, RoleService],
  exports: [RoleService],
})
export class RolesModule {}
