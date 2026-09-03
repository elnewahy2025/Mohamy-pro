import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { SessionGuard } from '../auth/session/session.guard';
import {
  ClientAddressService,
  type ClientAddressResult,
} from './address.service';
import {
  CreateClientAddressDto,
  RemoveClientAddressDto,
  UpdateClientAddressDto,
} from './address.dto';
import { ClientIdDto } from './client.dto';

@ApiTags('clients')
@Controller('clients/:clientId/addresses')
@UseGuards(SessionGuard, CsrfGuard)
export class ClientAddressController {
  constructor(private readonly addresses: ClientAddressService) {}

  @Post()
  @ApiOperation({ summary: 'Create a client address' })
  @ApiBody({ type: CreateClientAddressDto })
  @ApiResponse({ status: 201, description: 'Address created.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({ status: 403, description: 'Permission or tenant denied.' })
  create(
    @Req() req: Request,
    @Param() params: ClientIdDto,
    @Body() dto: CreateClientAddressDto,
  ): Promise<ClientAddressResult> {
    return this.addresses.create(req, {
      clientId: params.id,
      type: dto.type,
      line1: dto.line1,
      line2: dto.line2 ?? null,
      city: dto.city,
      region: dto.region ?? null,
      postalCode: dto.postalCode ?? null,
      country: dto.country,
      isPrimary: dto.isPrimary,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a client address' })
  @ApiBody({ type: UpdateClientAddressDto })
  @ApiResponse({ status: 200, description: 'Address updated.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({ status: 403, description: 'Permission or tenant denied.' })
  update(
    @Req() req: Request,
    @Param() params: { id: string },
    @Body() dto: UpdateClientAddressDto,
  ): Promise<ClientAddressResult> {
    return this.addresses.update(req, {
      id: params.id,
      line1: dto.line1,
      line2: dto.line2,
      city: dto.city,
      region: dto.region,
      postalCode: dto.postalCode,
      country: dto.country,
      isPrimary: dto.isPrimary,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a client address' })
  @ApiBody({ type: RemoveClientAddressDto })
  @ApiResponse({ status: 200, description: 'Address removed.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({ status: 403, description: 'Permission or tenant denied.' })
  remove(
    @Req() req: Request,
    @Param() params: { id: string },
    @Body() dto: RemoveClientAddressDto,
  ): Promise<void> {
    return this.addresses.remove(req, params.id, dto.reason);
  }
}
