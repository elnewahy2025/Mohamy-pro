import { Body, Controller, Get, Post, Version } from '@nestjs/common';
import { ApiError } from '../../src/common/api/api-error';
import { CreateResourceDto } from './create-resource.dto';

@Controller('contract')
export class ContractController {
  @Get('echo')
  @Version('1')
  echo(): { id: string } {
    return { id: 'contract-echo' };
  }

  @Get('not-found')
  @Version('1')
  notFound(): never {
    throw ApiError.notFound('Contract resource not found');
  }

  @Post('resource')
  @Version('1')
  create(@Body() dto: CreateResourceDto): { id: string; name: string } {
    return { id: 'resource-1', name: dto.name };
  }
}
