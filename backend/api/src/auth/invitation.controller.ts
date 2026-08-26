import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from './auth.types';
import { AuthenticationError } from './auth.errors';
import { TenantContextRequiredError } from './membership.errors';
import { SessionGuard } from './session.guard';
import { InvitationService } from './invitation.service';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { RequirePolicy } from '../authorization/require-policy.decorator';
import { Phase2BusinessInterceptor } from '../common/http/phase2-business.interceptor';

class InvitationScopeDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  organizationIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  branchIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  departmentIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  teamIds?: string[];
}

class CreateInvitationDto {
  @IsOptional()
  @IsEmail()
  @Length(3, 320)
  intendedEmail?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  intendedProviderSubject?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @Length(1, 64, { each: true })
  @Matches(/^[a-z][a-z0-9_.-]{0,63}$/, { each: true })
  requestedRoleKeys!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => InvitationScopeDto)
  requestedScope?: InvitationScopeDto;
}

class AcceptInvitationDto {
  @IsString()
  @Length(43, 43)
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;
}

@ApiTags('invitations')
@Controller('tenants/:tenantId/invitations')
@UseGuards(SessionGuard, AuthorizationGuard)
@UseInterceptors(Phase2BusinessInterceptor)
@RequirePolicy('CanManageMembership')
export class TenantInvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a tenant membership invitation' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUIDv4 key scoped to the authenticated tenant administrator.',
  })
  async create(
    @Param('tenantId', new ParseUUIDPipe({ version: '4' })) tenantId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateInvitationDto,
  ) {
    const session = request.authSession;
    const actorMembershipId = session?.activeMembershipId;
    if (!session || !actorMembershipId || session.activeTenantId !== tenantId) {
      throw new TenantContextRequiredError();
    }
    return this.invitations.create({
      actorUserId: session.userId,
      actorMembershipId,
      tenantId,
      correlationId: request.header('x-correlation-id') ?? '',
      intendedEmail: body.intendedEmail,
      intendedProviderSubject: body.intendedProviderSubject,
      requestedRoleKeys: body.requestedRoleKeys,
      requestedScope: body.requestedScope,
    });
  }

  @Post(':invitationId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a pending tenant membership invitation' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUIDv4 key scoped to the authenticated tenant administrator.',
  })
  async revoke(
    @Param('tenantId', new ParseUUIDPipe({ version: '4' })) tenantId: string,
    @Param('invitationId', new ParseUUIDPipe({ version: '4' }))
    invitationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const session = request.authSession;
    const actorMembershipId = session?.activeMembershipId;
    if (!session || !actorMembershipId || session.activeTenantId !== tenantId) {
      throw new TenantContextRequiredError();
    }
    return this.invitations.revoke({
      actorUserId: session.userId,
      actorMembershipId,
      tenantId,
      invitationId,
      correlationId: request.header('x-correlation-id') ?? '',
    });
  }
}

@ApiTags('invitations')
@Controller('invitations')
@UseGuards(SessionGuard)
@UseInterceptors(Phase2BusinessInterceptor)
export class InvitationAcceptanceController {
  constructor(private readonly invitations: InvitationService) {}

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an authenticated application invitation' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUIDv4 key scoped to the authenticated identity.',
  })
  async accept(
    @Req() request: AuthenticatedRequest,
    @Body() body: AcceptInvitationDto,
  ) {
    const session = request.authSession;
    if (!session) throw new AuthenticationError();
    return this.invitations.accept({
      session,
      token: body.token,
      correlationId: request.header('x-correlation-id') ?? '',
      sourceIp: request.ip,
    });
  }
}
