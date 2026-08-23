import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IsInt, IsUUID, Min } from 'class-validator';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from './auth.types';
import { MembershipService } from './membership.service';
import { SessionGuard } from './session.guard';
import { Phase2BusinessInterceptor } from '../common/http/phase2-business.interceptor';

class TenantSwitchDto {
  @IsUUID('4')
  tenantId!: string;

  @IsInt()
  @Min(0)
  expectedContextVersion!: number;
}

@ApiTags('session')
@Controller('session')
@UseGuards(SessionGuard)
@UseInterceptors(Phase2BusinessInterceptor)
export class TenantSessionController {
  constructor(private readonly memberships: MembershipService) {}

  @Post('tenant-switch')
  @ApiOperation({ summary: 'Switch the authenticated session tenant context' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUIDv4 key scoped to the authenticated actor and route.',
  })
  async switchTenant(
    @Req() request: AuthenticatedRequest,
    @Body() body: TenantSwitchDto,
  ) {
    const session = request.authSession;
    if (!session) throw new Error('Authenticated session is required');
    return this.memberships.switchTenant({
      sessionId: session.sessionId,
      userId: session.userId,
      targetTenantId: body.tenantId,
      correlationId: request.header('x-correlation-id') ?? '',
      expectedContextVersion: body.expectedContextVersion,
      sourceTenantId: session.activeTenantId,
      sourceMembershipId: session.activeMembershipId,
    });
  }
}
