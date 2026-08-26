import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { AuthorizationGuard } from './authorization.guard';
import { RequirePolicy } from './require-policy.decorator';
import { AuthorizationService } from './authorization.service';

@ApiTags('authorization')
@Controller('authorization')
@UseGuards(SessionGuard, AuthorizationGuard)
export class AuthorizationController {
  constructor(private readonly authorization: AuthorizationService) {}

  @Get('access')
  @RequirePolicy('CanViewTenant')
  @ApiOperation({
    summary: 'Return server-computed access for the current tenant context',
  })
  async getAccess(@Req() request: AuthenticatedRequest) {
    const session = request.authSession;
    if (!session) throw new Error('Authenticated session is required');
    return this.authorization.getCurrentAccess(session);
  }
}
