import { Controller, Get, Version } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import type { ServiceInfo } from './app.service';

@ApiTags('system')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Version('1')
  @ApiOperation({ summary: 'Get API service information' })
  @ApiResponse({ status: 200, description: 'API service information.' })
  getServiceInfo(): ServiceInfo {
    return this.appService.getServiceInfo();
  }
}
