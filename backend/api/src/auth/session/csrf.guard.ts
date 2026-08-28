import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { ValidatedEnvironment } from '../../config/env.validation';
import { CsrfMismatchError } from '../auth.errors';
import { SessionService } from './session.service';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly configService: ConfigService<ValidatedEnvironment, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();
    if (!STATE_CHANGING_METHODS.has(method)) {
      return true;
    }
    if (!request.auth) {
      throw new CsrfMismatchError('Authentication is required for CSRF checks');
    }
    this.assertOrigin(request);
    const candidate = request.header('x-csrf-token');
    if (!candidate) {
      throw new CsrfMismatchError('Missing X-CSRF-Token');
    }
    const ok = await this.sessions.verifyCsrf(
      request.auth.sessionId,
      candidate,
    );
    if (!ok) {
      throw new CsrfMismatchError('Invalid X-CSRF-Token');
    }
    return true;
  }

  private assertOrigin(request: Request): void {
    const origin = request.header('origin');
    if (!origin) {
      throw new CsrfMismatchError('Missing Origin header');
    }
    const allowed = (this.configService.get<string>('CORS_ORIGINS') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!allowed.includes(origin)) {
      throw new CsrfMismatchError('Cross-origin request rejected');
    }
  }
}
