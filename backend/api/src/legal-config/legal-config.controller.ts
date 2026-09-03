import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
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
  listCountries() {
    return this.legalConfigService.listCountries();
  }

  @Post('countries')
  createCountry(@Body() dto: CreateCountryDto) {
    return this.legalConfigService.createCountry(dto);
  }

  @Get('jurisdictions')
  listJurisdictions(@Query('countryId') countryId?: string) {
    return this.legalConfigService.listJurisdictions(countryId);
  }

  @Post('jurisdictions')
  createJurisdiction(@Body() dto: CreateJurisdictionDto) {
    return this.legalConfigService.createJurisdiction(dto);
  }

  @Get('courts')
  listCourts(@Query('jurisdictionId') jurisdictionId?: string) {
    return this.legalConfigService.listCourts(jurisdictionId);
  }

  @Post('courts')
  createCourt(@Body() dto: CreateCourtDto) {
    return this.legalConfigService.createCourt(dto);
  }

  @Get('court-locations')
  listCourtLocations(@Query('courtId') courtId: string) {
    return this.legalConfigService.listCourtLocations(courtId);
  }

  @Post('court-locations')
  createCourtLocation(@Body() dto: CreateCourtLocationDto) {
    return this.legalConfigService.createCourtLocation(dto);
  }
}
