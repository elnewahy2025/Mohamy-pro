import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { ClientService, type ClientResult } from './client.service';
import {
  ArchiveClientDto,
  ClientIdDto,
  CreateClientDto,
  ListClientQueryDto,
  UpdateClientDto,
} from './client.dto';

@ApiTags('clients')
@Controller('clients')
@UseGuards(SessionGuard, CsrfGuard)
export class ClientController {
  constructor(private readonly clients: ClientService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a tenant client (individual or organization)',
  })
  @ApiBody({ type: CreateClientDto })
  @ApiResponse({ status: 201, description: 'Client created.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permitted.',
  })
  create(
    @Req() req: Request,
    @Body() dto: CreateClientDto,
  ): Promise<ClientResult> {
    return this.clients.create(req, {
      clientType: dto.clientType,
      name: dto.name,
      legalName: dto.legalName ?? null,
      source: dto.source ?? null,
      notes: dto.notes ?? null,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List clients (paginated, searchable, filterable)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'ARCHIVED'] })
  @ApiQuery({
    name: 'clientType',
    required: false,
    enum: ['INDIVIDUAL', 'ORGANIZATION'],
  })
  @ApiResponse({ status: 200, description: 'Paginated client list.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing/invalid or permission denied.',
  })
  list(
    @Req() req: Request,
    @Query() dto: ListClientQueryDto,
  ): Promise<Paginated<ClientResult>> {
    return this.clients.list(req, {
      page: dto.page ?? 1,
      limit: dto.limit ?? 20,
      search: dto.search,
      status: dto.status,
      clientType: dto.clientType,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single tenant client' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Client returned.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'Permission denied or client not in tenant.',
  })
  get(
    @Req() req: Request,
    @Param() params: ClientIdDto,
  ): Promise<ClientResult> {
    return this.clients.get(req, params.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tenant client' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateClientDto })
  @ApiResponse({ status: 200, description: 'Client updated.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'Permission denied or CSRF invalid.',
  })
  update(
    @Req() req: Request,
    @Param() params: ClientIdDto,
    @Body() dto: UpdateClientDto,
  ): Promise<ClientResult> {
    return this.clients.update(req, {
      id: params.id,
      name: dto.name,
      legalName: dto.legalName,
      source: dto.source,
      notes: dto.notes,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive a tenant client (soft delete)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ArchiveClientDto })
  @ApiResponse({ status: 200, description: 'Client archived.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'Permission denied or CSRF invalid.',
  })
  archive(
    @Req() req: Request,
    @Param() params: ClientIdDto,
    @Body() dto: ArchiveClientDto,
  ): Promise<ClientResult> {
    return this.clients.archive(req, params.id, dto.reason);
  }
}
