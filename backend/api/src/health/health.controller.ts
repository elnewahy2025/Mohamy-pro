import { Controller, Get, HttpStatus, Res, Version } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService, ReadinessResponse } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @Version('1')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'The API process is alive.' })
  getLiveness(): ReturnType<HealthService['getLiveness']> {
    return this.health.getLiveness();
  }

  @Get('ready')
  @Version('1')
  @ApiOperation({ summary: 'Readiness probe for all required infrastructure' })
  @ApiResponse({ status: 200, description: 'All required dependencies are ready.' })
  @ApiResponse({ status: 503, description: 'One or more dependencies are unavailable.' })
  async getReadiness(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponse> {
    const result = await this.health.getReadiness();
    response.status(result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }

  @Get()
  @Version('1')
  @ApiOperation({ summary: 'Aggregate health response' })
  @ApiResponse({ status: 200, description: 'All required dependencies are ready.' })
  @ApiResponse({ status: 503, description: 'One or more dependencies are unavailable.' })
  async getHealth(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponse> {
    const result = await this.health.getReadiness();
    response.status(result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
