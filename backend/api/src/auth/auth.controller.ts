import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthenticationError } from './auth.errors';
import type { AuthenticatedRequest } from './auth.types';
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from './session-cookie';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../config/env.validation';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<ValidatedEnvironment, true>,
  ) {}

  @Get('login')
  @ApiOperation({ summary: 'Start the OIDC Authorization Code + PKCE flow' })
  async login(
    @Query('returnTo') returnTo: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const location = await this.auth.startLogin(returnTo);
    response.redirect(302, location);
  }

  @Get('callback')
  @ApiOperation({
    summary: 'Complete the OIDC callback and create an app session',
  })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.auth.completeLogin({ code, state, error });
    setSessionCookie(response, result.cookieValue, this.config);
    const frontendLocation = new URL(
      result.returnTo,
      `${this.config.getOrThrow('FRONTEND_ORIGIN')}/`,
    ).toString();
    response.redirect(302, frontendLocation);
  }

  @Get('session')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'Read the authenticated application session' })
  session(@Req() request: AuthenticatedRequest): unknown {
    if (!request.authSession) throw new AuthenticationError();
    return this.sessions.toView(request.authSession);
  }

  @Get('csrf')
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: 'Obtain the CSRF token for the authenticated session',
  })
  async csrf(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ csrfToken: string }> {
    if (!request.authSession) throw new AuthenticationError();
    const csrfToken = await this.sessions.getCsrfToken(
      request.authSession.sessionId,
    );
    if (!csrfToken) throw new AuthenticationError();
    return { csrfToken };
  }

  @Post('refresh')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Refresh the server-side provider session' })
  async refresh(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    if (!request.authSession) throw new AuthenticationError();
    const cookie = readSessionCookie(
      request.headers.cookie,
      this.config.getOrThrow('SESSION_COOKIE_NAME'),
    );
    if (!cookie || !(await this.sessions.refreshByCookie(cookie))) {
      clearSessionCookie(response, this.config);
      throw new AuthenticationError();
    }
    response.status(HttpStatus.NO_CONTENT).send();
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'Revoke the current application session' })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const cookie = readSessionCookie(
      request.headers.cookie,
      this.config.getOrThrow('SESSION_COOKIE_NAME'),
    );
    if (cookie) await this.auth.logout(cookie);
    clearSessionCookie(response, this.config);
    response.status(204).send();
  }
}
