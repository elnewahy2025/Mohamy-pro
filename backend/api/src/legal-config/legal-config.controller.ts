import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { LegalConfigService } from './legal-config.service';
import {
  CreateCountryDto,
  CreateJurisdictionDto,
  CreateCourtDto,
  CreateCourtLocationDto,
} from './legal-config.dto';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';

@UseGuards(SessionGuard, CsrfGuard)
@Controller('legal-config')
export class LegalConfigController {
  constructor(private readonly legalConfigService: LegalConfigService) {}

  @Get('countries')
  listCountries(@Req() request: Request) {
    return this.legalConfigService.listCountries(request);
  }

  @Post('countries')
  createCountry(@Req() request: Request, @Body() dto: CreateCountryDto) {
    return this.legalConfigService.createCountry(request, dto);
  }

  @Get('jurisdictions')
  listJurisdictions(
    @Req() request: Request,
    @Query('countryId') countryId?: string,
  ) {
    return this.legalConfigService.listJurisdictions(request, countryId);
  }

  @Post('jurisdictions')
  createJurisdiction(
    @Req() request: Request,
    @Body() dto: CreateJurisdictionDto,
  ) {
    return this.legalConfigService.createJurisdiction(request, dto);
  }

  @Get('courts')
  listCourts(
    @Req() request: Request,
    @Query('jurisdictionId') jurisdictionId?: string,
  ) {
    return this.legalConfigService.listCourts(request, jurisdictionId);
  }

  @Post('courts')
  createCourt(@Req() request: Request, @Body() dto: CreateCourtDto) {
    return this.legalConfigService.createCourt(request, dto);
  }

  @Get('court-locations')
  listCourtLocations(
    @Req() request: Request,
    @Query('courtId') courtId: string,
  ) {
    return this.legalConfigService.listCourtLocations(request, courtId);
  }

  @Post('court-locations')
  createCourtLocation(
    @Req() request: Request,
    @Body() dto: CreateCourtLocationDto,
  ) {
    return this.legalConfigService.createCourtLocation(request, dto);
  }
}
