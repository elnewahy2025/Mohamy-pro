import { Module } from '@nestjs/common';
import { OrganizationSettingsController } from './settings/settings.controller';
import { OrganizationSettingsService } from './settings/settings.service';
import { HierarchyOperations } from './hierarchy/hierarchy.operations';
import { OrganizationController } from './hierarchy/organization.controller';
import { OrganizationService } from './hierarchy/organization.service';
import { BranchController } from './hierarchy/branch.controller';
import { BranchService } from './hierarchy/branch.service';
import { DepartmentController } from './hierarchy/department.controller';
import { DepartmentService } from './hierarchy/department.service';
import { TeamController } from './hierarchy/team.controller';
import { TeamService } from './hierarchy/team.service';

@Module({
  controllers: [
    OrganizationSettingsController,
    OrganizationController,
    BranchController,
    DepartmentController,
    TeamController,
  ],
  providers: [
    OrganizationSettingsService,
    HierarchyOperations,
    OrganizationService,
    BranchService,
    DepartmentService,
    TeamService,
  ],
})
export class OrganizationConfigModule {}
