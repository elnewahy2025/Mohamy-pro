import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { RoleOperations } from './role.operations';
import {
  AssignRoleDto,
  CreateRoleDto,
  GrantRolePermissionsDto,
  RevokeRoleDto,
} from './role.dto';
import { RoleService } from './role.service';

@Controller({
  path: 'roles',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class RoleController {
  constructor(
    private readonly operations: RoleOperations,
    private readonly roles: RoleService,
  ) {}

  @Post()
  async createRole(@Req() request: Request, @Body() dto: CreateRoleDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.ROLE_CREATED,
      'Role',
      (tx) => this.roles.createRole(tx, ctx.tenantId, dto),
      { roleKey: dto.key },
    );
  }

  @Get()
  async listRoles(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, (tx) =>
      this.roles.listRoles(tx, ctx.tenantId),
    );
  }

  @Post(':id/permissions')
  async grantPermissions(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GrantRolePermissionsDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.ROLE_PERMISSION_GRANTED,
      'Role',
      (tx) =>
        this.roles.grantPermissions(
          tx,
          ctx.tenantId,
          ctx.actorMembershipId,
          id,
          dto.permissionKeys,
        ),
      { permissionKeys: dto.permissionKeys.join(',') },
    );
  }

  @Delete(':id/permissions')
  async revokePermissions(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GrantRolePermissionsDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.ROLE_PERMISSION_REVOKED,
      'Role',
      (tx) =>
        this.roles.revokePermissions(tx, ctx.tenantId, id, dto.permissionKeys),
      { permissionKeys: dto.permissionKeys.join(',') },
    );
  }

  @Post(':id/assign')
  async assignRole(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.ROLE_ASSIGNED,
      'MembershipRole',
      (tx) =>
        this.roles.assignRole(
          tx,
          ctx.tenantId,
          ctx.actorMembershipId,
          dto.membershipId,
          id,
        ),
      {},
    );
  }

  @Post(':id/revoke')
  async revokeAssignment(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeRoleDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.MEMBER_ROLE_REVOKED,
      'MembershipRole',
      (tx) =>
        this.roles.revokeAssignment(
          tx,
          ctx.tenantId,
          ctx.actorMembershipId,
          dto.membershipId,
          id,
        ),
      {},
    );
  }
}
