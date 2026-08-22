import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthenticationError } from './auth.errors';
import type { AuthenticatedRequest } from './auth.types';
import { readSessionCookie } from './session-cookie';
import { SessionService } from './session.service';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../config/env.validation';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly config: ConfigService<ValidatedEnvironment, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.authSession) return true;
    const cookie = readSessionCookie(
      request.headers.cookie,
      this.config.getOrThrow('SESSION_COOKIE_NAME'),
    );
    if (!cookie) throw new AuthenticationError();
    const session = await this.sessions.findByCookie(cookie);
    if (!session) throw new AuthenticationError();
    request.authSession = session;
    return true;
  }
}
