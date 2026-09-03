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
import { CaseService } from './case.service';
import {
  AddCasePartyDto,
  CaseQueryDto,
  CreateCaseDto,
  UpdateCaseDto,
} from './case.dto';

@Controller('cases')
@UseGuards(SessionGuard, CsrfGuard)
export class CaseController {
  constructor(private readonly caseService: CaseService) {}

  @Post()
  async createCase(@Req() request: Request, @Body() dto: CreateCaseDto) {
    return this.caseService.createCase(request, dto);
  }

  @Get()
  async listCases(@Req() request: Request, @Query() query: CaseQueryDto) {
    return this.caseService.listCases(request, query);
  }

  @Get(':id')
  async getCase(@Req() request: Request, @Param('id') id: string) {
    return this.caseService.getCase(request, id);
  }

  @Patch(':id')
  async updateCase(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: UpdateCaseDto,
  ) {
    return this.caseService.updateCase(request, id, dto);
  }

  @Post(':id/parties')
  async addParty(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: AddCasePartyDto,
  ) {
    return this.caseService.addParty(request, id, dto);
  }

  @Delete(':id/parties/:partyId')
  @HttpCode(204)
  async removeParty(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('partyId') partyId: string,
  ) {
    await this.caseService.removeParty(request, id, partyId);
  }
}
