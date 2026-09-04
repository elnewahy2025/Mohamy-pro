import { Controller, Post, Get, Body, Req } from '@nestjs/common';
import { RateService } from './rate.service';

@Controller('v1/rates')
export class RateController {
  constructor(private readonly rateService: RateService) {}

  @Post()
  async createRate(@Body() data: any, @Req() req: any) {
    return this.rateService.createRate(
      req.tenantId,
      req.user?.id || 'system',
      data,
    );
  }

  @Get()
  async listRates(@Req() req: any) {
    return this.rateService.getRates(req.tenantId);
  }
}
