import { Body, Controller, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CsrfGuard } from '../../auth/session/csrf.guard';
import { SessionGuard } from '../../auth/session/session.guard';
import { DepartmentService, type DepartmentResult } from './department.service';
import {
  ArchiveDepartmentDto,
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from './department.dto';

@ApiTags('organization-config')
@Controller('organization-config/departments')
@UseGuards(SessionGuard, CsrfGuard)
export class DepartmentController {
  constructor(private readonly departments: DepartmentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a tenant department' })
  @ApiResponse({ status: 201, description: 'Department created.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  create(
    @Req() req: Request,
    @Body() dto: CreateDepartmentDto,
  ): Promise<DepartmentResult> {
    return this.departments.create(req, dto);
  }

  @Patch()
  @ApiOperation({ summary: 'Update a tenant department' })
  @ApiResponse({ status: 200, description: 'Department updated.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  update(
    @Req() req: Request,
    @Body() dto: UpdateDepartmentDto,
  ): Promise<DepartmentResult> {
    return this.departments.update(req, dto);
  }

  @Patch('archive')
  @ApiOperation({ summary: 'Archive a tenant department' })
  @ApiResponse({ status: 200, description: 'Department archived.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  archive(
    @Req() req: Request,
    @Body() dto: ArchiveDepartmentDto,
  ): Promise<DepartmentResult> {
    return this.departments.archive(req, dto.id, dto.reason);
  }
}
