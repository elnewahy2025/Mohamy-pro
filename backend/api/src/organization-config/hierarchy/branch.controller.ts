import { Body, Controller, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CsrfGuard } from '../../auth/session/csrf.guard';
import { SessionGuard } from '../../auth/session/session.guard';
import { BranchService, type BranchResult } from './branch.service';
import {
  ArchiveBranchDto,
  CreateBranchDto,
  UpdateBranchDto,
} from './branch.dto';

@ApiTags('organization-config')
@Controller('organization-config/branches')
@UseGuards(SessionGuard, CsrfGuard)
export class BranchController {
  constructor(private readonly branches: BranchService) {}

  @Post()
  @ApiOperation({ summary: 'Create a tenant branch' })
  @ApiResponse({ status: 201, description: 'Branch created.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  create(
    @Req() req: Request,
    @Body() dto: CreateBranchDto,
  ): Promise<BranchResult> {
    return this.branches.create(req, dto);
  }

  @Patch()
  @ApiOperation({ summary: 'Update a tenant branch' })
  @ApiResponse({ status: 200, description: 'Branch updated.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  update(
    @Req() req: Request,
    @Body() dto: UpdateBranchDto,
  ): Promise<BranchResult> {
    return this.branches.update(req, dto);
  }

  @Patch('archive')
  @ApiOperation({ summary: 'Archive a tenant branch' })
  @ApiResponse({ status: 200, description: 'Branch archived.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  archive(
    @Req() req: Request,
    @Body() dto: ArchiveBranchDto,
  ): Promise<BranchResult> {
    return this.branches.archive(req, dto.id, dto.reason);
  }
}
