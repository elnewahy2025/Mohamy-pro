import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { SessionCookieService } from './session-cookie.service';
import { SessionService } from './session.service';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly cookies: SessionCookieService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.cookies.readSession(request);
    if (!token) {
      return false;
    }
    const details = await this.sessions.validateSession(token);
    request.auth = details;
    return true;
  }
}
