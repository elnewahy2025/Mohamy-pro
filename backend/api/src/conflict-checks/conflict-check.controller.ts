import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { Paginated } from '../common/api/envelope';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { SessionGuard } from '../auth/session/session.guard';
import {
  ConflictCheckService,
  type ConflictCheckListRow,
  type ConflictCheckResult,
} from './conflict-check.service';
import {
  ConflictCheckIdDto,
  CreateConflictCheckDto,
  DecideConflictCheckDto,
  ListConflictCheckQueryDto,
  StartConflictReviewDto,
} from './conflict-check.dto';

@ApiTags('conflict-checks')
@Controller('conflict-checks')
@UseGuards(SessionGuard, CsrfGuard)
export class ConflictCheckController {
  constructor(private readonly checks: ConflictCheckService) {}

  @Post()
  @ApiOperation({
    summary:
      'Request a conflict check for prospective parties (before matter acceptance)',
  })
  @ApiBody({ type: CreateConflictCheckDto })
  @ApiResponse({ status: 201, description: 'Conflict check created.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  request(
    @Req() req: Request,
    @Body() dto: CreateConflictCheckDto,
  ): Promise<ConflictCheckResult> {
    return this.checks.request(req, {
      clientId: dto.clientId ?? null,
      parties: dto.parties,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List conflict checks (paginated, filterable)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'IN_REVIEW', 'COMPLETED'],
  })
  @ApiResponse({ status: 200, description: 'Paginated conflict check list.' })
  list(
    @Req() req: Request,
    @Query() dto: ListConflictCheckQueryDto,
  ): Promise<Paginated<ConflictCheckListRow>> {
    return this.checks.list(req, {
      page: dto.page ?? 1,
      limit: dto.limit ?? 20,
      status: dto.status,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single conflict check with its parties' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Conflict check returned.' })
  @ApiResponse({
    status: 403,
    description: 'Permission denied or check not in tenant.',
  })
  get(
    @Req() req: Request,
    @Param() params: ConflictCheckIdDto,
  ): Promise<ConflictCheckResult> {
    return this.checks.get(req, params.id);
  }

  @Post(':id/review')
  @ApiOperation({
    summary: 'Start review of a conflict check (PENDING -> IN_REVIEW)',
  })
  @ApiBody({ type: StartConflictReviewDto })
  @ApiResponse({ status: 200, description: 'Conflict check moved to review.' })
  @ApiResponse({
    status: 403,
    description:
      'Permission denied or check not in tenant / already completed.',
  })
  startReview(
    @Req() req: Request,
    @Param() params: ConflictCheckIdDto,
    @Body() _dto: StartConflictReviewDto,
  ): Promise<ConflictCheckResult> {
    return this.checks.startReview(req, params.id);
  }

  @Post(':id/decide')
  @ApiOperation({
    summary: 'Record the final ALLOW/BLOCK decision (-> COMPLETED)',
  })
  @ApiBody({ type: DecideConflictCheckDto })
  @ApiResponse({
    status: 200,
    description: 'Conflict check decision recorded.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Permission denied or check not in tenant / already completed.',
  })
  decide(
    @Req() req: Request,
    @Param() params: ConflictCheckIdDto,
    @Body() dto: DecideConflictCheckDto,
  ): Promise<ConflictCheckResult> {
    return this.checks.decide(req, {
      id: params.id,
      decision: dto.decision,
      reason: dto.reason,
    });
  }
}
