import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { SessionGuard } from '../auth/session/session.guard';
import { PartyService } from './party.service';
import { PartyRoleService } from './party-role.service';
import { PartyRelationshipService } from './party-relationship.service';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';
import { PartyQueryDto } from './dto/party-query.dto';
import { CreatePartyRelationshipDto } from './dto/create-party-relationship.dto';
import { PaginationDto } from '../common/api/pagination.dto';

@Controller('parties')
@UseGuards(SessionGuard, CsrfGuard)
export class PartyController {
  constructor(
    private readonly partyService: PartyService,
    private readonly roleService: PartyRoleService,
    private readonly relationshipService: PartyRelationshipService,
  ) {}

  @Post()
  async createParty(@Req() request: Request, @Body() dto: CreatePartyDto) {
    return this.partyService.create(request, dto);
  }

  @Get()
  async listParties(@Req() request: Request, @Query() query: PartyQueryDto) {
    return this.partyService.list(request, query);
  }

  @Get('roles')
  async listRoles(@Req() request: Request) {
    return this.roleService.list(request);
  }

  @Get(':id')
  async getParty(@Req() request: Request, @Param('id') id: string) {
    return this.partyService.get(request, id);
  }

  @Patch(':id')
  async updateParty(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: UpdatePartyDto,
  ) {
    return this.partyService.update(request, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async archiveParty(
    @Req() request: Request,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    await this.partyService.archive(request, id, reason || 'Archived via API');
  }

  @Post(':id/relationships')
  async createRelationship(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: CreatePartyRelationshipDto,
  ) {
    return this.relationshipService.create(request, id, dto);
  }

  @Get(':id/relationships')
  async listRelationships(
    @Req() request: Request,
    @Param('id') id: string,
    @Query() query: PaginationDto,
  ) {
    return this.relationshipService.list(request, id, query);
  }
}
