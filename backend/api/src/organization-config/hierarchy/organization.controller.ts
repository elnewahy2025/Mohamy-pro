import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CsrfGuard } from '../../auth/session/csrf.guard';
import { SessionGuard } from '../../auth/session/session.guard';
import {
  OrganizationService,
  type OrganizationResult,
} from './organization.service';
import {
  ArchiveOrganizationDto,
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from './organization.dto';

@ApiTags('organization-config')
@Controller('organization-config/organizations')
@UseGuards(SessionGuard, CsrfGuard)
export class OrganizationController {
  constructor(private readonly organizations: OrganizationService) {}

  @Post()
  @ApiOperation({ summary: 'Create a tenant organization' })
  @ApiResponse({ status: 201, description: 'Organization created.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  create(
    @Req() req: Request,
    @Body() dto: CreateOrganizationDto,
  ): Promise<OrganizationResult> {
    return this.organizations.create(req, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List tenant organizations' })
  @ApiResponse({ status: 200, description: 'Organization list returned.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  list(@Req() req: Request): Promise<OrganizationResult[]> {
    return this.organizations.list(req);
  }

  @Patch()
  @ApiOperation({ summary: 'Update a tenant organization' })
  @ApiResponse({ status: 200, description: 'Organization updated.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  update(
    @Req() req: Request,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<OrganizationResult> {
    return this.organizations.update(req, dto);
  }

  @Patch('archive')
  @ApiOperation({ summary: 'Archive a tenant organization' })
  @ApiResponse({ status: 200, description: 'Organization archived.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  archive(
    @Req() req: Request,
    @Body() dto: ArchiveOrganizationDto,
  ): Promise<OrganizationResult> {
    return this.organizations.archive(req, dto.id, dto.reason);
  }

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Upload the tenant organization logo' })
  @ApiResponse({ status: 201, description: 'Logo uploaded.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  uploadLogo(
    @Req() req: Request,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<OrganizationResult> {
    return this.organizations.uploadLogo(req, file);
  }
}
