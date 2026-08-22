import { timingSafeEqual } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { ValidatedEnvironment } from '../config/env.validation';
import { AuthenticationError, CsrfError, OriginError } from './auth.errors';
import type { AuthenticatedRequest } from './auth.types';
import { readSessionCookie } from './session-cookie';
import { SessionService } from './session.service';
import { SessionCryptoService } from './session-crypto.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfOriginMiddleware implements NestMiddleware {
  constructor(
    private readonly sessions: SessionService,
    private readonly crypto: SessionCryptoService,
    private readonly config: ConfigService<ValidatedEnvironment, true>,
  ) {}

  async use(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> {
    if (SAFE_METHODS.has(request.method)) {
      next();
      return;
    }
    try {
      await this.enforce(request);
      next();
    } catch (error) {
      next(error);
    }
  }

  private async enforce(request: Request): Promise<void> {
    const cookie = readSessionCookie(
      request.headers.cookie,
      this.config.getOrThrow<string>('SESSION_COOKIE_NAME'),
    );
    if (!cookie) throw new AuthenticationError();

    const session = await this.sessions.findByCookie(cookie);
    if (!session) throw new AuthenticationError();

    const origin = request.headers.origin;
    const allowedOrigins = this.config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((value: string) => value.trim())
      .filter(Boolean);
    if (typeof origin !== 'string' || !allowedOrigins.includes(origin)) {
      throw new OriginError();
    }

    const headerName = this.config
      .getOrThrow<string>('CSRF_HEADER_NAME')
      .toLowerCase();
    const suppliedHeader = request.headers[headerName];
    const supplied = Array.isArray(suppliedHeader) ? undefined : suppliedHeader;
    if (typeof supplied !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(supplied)) {
      throw new CsrfError();
    }
    const expectedHash = session.csrfTokenHash;
    const suppliedHash = this.crypto.hash(supplied);
    const expectedBytes = Buffer.from(expectedHash, 'utf8');
    const suppliedBytes = Buffer.from(suppliedHash, 'utf8');
    if (
      expectedBytes.length !== suppliedBytes.length ||
      !timingSafeEqual(expectedBytes, suppliedBytes)
    ) {
      throw new CsrfError();
    }

    (request as AuthenticatedRequest).authSession = session;
  }
}
