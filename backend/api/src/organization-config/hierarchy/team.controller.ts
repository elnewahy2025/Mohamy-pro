import { Body, Controller, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CsrfGuard } from '../../auth/session/csrf.guard';
import { SessionGuard } from '../../auth/session/session.guard';
import { TeamService, type TeamResult } from './team.service';
import { ArchiveTeamDto, CreateTeamDto, UpdateTeamDto } from './team.dto';

@ApiTags('organization-config')
@Controller('organization-config/teams')
@UseGuards(SessionGuard, CsrfGuard)
export class TeamController {
  constructor(private readonly teams: TeamService) {}

  @Post()
  @ApiOperation({ summary: 'Create a tenant team' })
  @ApiResponse({ status: 201, description: 'Team created.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  create(@Req() req: Request, @Body() dto: CreateTeamDto): Promise<TeamResult> {
    return this.teams.create(req, dto);
  }

  @Patch()
  @ApiOperation({ summary: 'Update a tenant team' })
  @ApiResponse({ status: 200, description: 'Team updated.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  update(@Req() req: Request, @Body() dto: UpdateTeamDto): Promise<TeamResult> {
    return this.teams.update(req, dto);
  }

  @Patch('archive')
  @ApiOperation({ summary: 'Archive a tenant team' })
  @ApiResponse({ status: 200, description: 'Team archived.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  archive(
    @Req() req: Request,
    @Body() dto: ArchiveTeamDto,
  ): Promise<TeamResult> {
    return this.teams.archive(req, dto.id, dto.reason);
  }
}
