import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { AdministrativeSessionService } from '../auth/administrative-session.service';
import { Phase2BusinessInterceptor } from '../common/http/phase2-business.interceptor';
import { AuthorizationGuard } from './authorization.guard';
import { RequirePolicy } from './require-policy.decorator';
import { AuthorizationService } from './authorization.service';

@ApiTags('authorization')
@Controller('authorization')
@UseGuards(SessionGuard, AuthorizationGuard)
export class AuthorizationController {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly administrativeSessions: AdministrativeSessionService,
  ) {}

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

  @Post('users/:userId/sessions/revoke')
  @RequirePolicy('CanPerformPlatformOperation')
  @UseInterceptors(Phase2BusinessInterceptor)
  @ApiOperation({
    summary: 'Revoke all active application sessions for another user',
  })
  async revokeUserSessions(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) targetUserId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const session = request.authSession;
    if (!session) throw new Error('Authenticated session is required');
    return this.administrativeSessions.revokeAllForUser({
      actorUserId: session.userId,
      targetUserId,
    });
  }
}
