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
  ClientContactService,
  type ClientContactResult,
} from './contact.service';
import {
  CreateClientContactDto,
  RemoveClientContactDto,
  UpdateClientContactDto,
} from './contact.dto';
import { ClientIdDto } from './client.dto';

@ApiTags('clients')
@Controller('clients/:clientId/contacts')
@UseGuards(SessionGuard, CsrfGuard)
export class ClientContactController {
  constructor(private readonly contacts: ClientContactService) {}

  @Post()
  @ApiOperation({ summary: 'Create a client contact channel' })
  @ApiBody({ type: CreateClientContactDto })
  @ApiResponse({ status: 201, description: 'Contact created.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({ status: 403, description: 'Permission or tenant denied.' })
  create(
    @Req() req: Request,
    @Param() params: ClientIdDto,
    @Body() dto: CreateClientContactDto,
  ): Promise<ClientContactResult> {
    return this.contacts.create(req, {
      clientId: params.id,
      type: dto.type,
      value: dto.value,
      label: dto.label ?? null,
      isPrimary: dto.isPrimary,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a client contact channel' })
  @ApiBody({ type: UpdateClientContactDto })
  @ApiResponse({ status: 200, description: 'Contact updated.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({ status: 403, description: 'Permission or tenant denied.' })
  update(
    @Req() req: Request,
    @Param() params: { id: string },
    @Body() dto: UpdateClientContactDto,
  ): Promise<ClientContactResult> {
    return this.contacts.update(req, {
      id: params.id,
      value: dto.value,
      label: dto.label,
      isPrimary: dto.isPrimary,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a client contact channel' })
  @ApiBody({ type: RemoveClientContactDto })
  @ApiResponse({ status: 200, description: 'Contact removed.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({ status: 403, description: 'Permission or tenant denied.' })
  remove(
    @Req() req: Request,
    @Param() params: { id: string },
    @Body() dto: RemoveClientContactDto,
  ): Promise<void> {
    return this.contacts.remove(req, params.id, dto.reason);
  }
}
