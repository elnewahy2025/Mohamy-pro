import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SessionGuard } from './session/session.guard';
import { CsrfGuard } from './session/csrf.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('login')
  @ApiOperation({
    summary: 'Start the OIDC login flow',
    description:
      'Redirects to the configured OIDC provider to authenticate the caller.',
  })
  @ApiResponse({ status: 307, description: 'Redirect to the OIDC provider.' })
  @ApiResponse({
    status: 500,
    description: 'OIDC provider configuration error.',
  })
  async login(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { redirectUrl } = await this.auth.beginLogin(req, res);
    res.redirect(307, redirectUrl);
  }

  @Get('callback')
  @ApiOperation({
    summary: 'Handle the OIDC provider callback',
    description:
      'Exchanges the authorization code, establishes a session, and redirects the caller.',
  })
  @ApiResponse({ status: 302, description: 'Redirect after successful login.' })
  @ApiResponse({ status: 500, description: 'OIDC exchange or session error.' })
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { redirectUrl } = await this.auth.handleCallback(req, res);
    res.redirect(302, redirectUrl);
  }

  @Get('csrf')
  @UseGuards(SessionGuard, CsrfGuard)
  @ApiOperation({ summary: 'Issue a CSRF token for the current session' })
  @ApiResponse({ status: 200, description: 'CSRF token issued.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing or invalid.',
  })
  async csrf(@Req() req: Request) {
    return this.auth.issueCsrf(req.auth!);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'Return the current session identity' })
  @ApiResponse({ status: 200, description: 'Session identity returned.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  me(@Req() req: Request) {
    return this.auth.me(req.auth!);
  }

  @Post('logout')
  @UseGuards(SessionGuard, CsrfGuard)
  @ApiOperation({ summary: 'End the current session' })
  @ApiResponse({ status: 302, description: 'Redirect after logout.' })
  @ApiResponse({ status: 401, description: 'Session is not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF token is missing or invalid.',
  })
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { redirectUrl } = await this.auth.logout(req, res);
    res.redirect(302, redirectUrl);
  }
}
