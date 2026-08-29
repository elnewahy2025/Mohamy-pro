import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SessionGuard } from './session/session.guard';
import { CsrfGuard } from './session/csrf.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('login')
  async login(@Res() res: Response): Promise<void> {
    const { redirectUrl } = await this.auth.beginLogin(res);
    res.redirect(307, redirectUrl);
  }

  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { redirectUrl } = await this.auth.handleCallback(req, res);
    res.redirect(302, redirectUrl);
  }

  @Get('csrf')
  @UseGuards(SessionGuard, CsrfGuard)
  async csrf(@Req() req: Request) {
    return this.auth.issueCsrf(req.auth!);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: Request) {
    return this.auth.me(req.auth!);
  }

  @Post('logout')
  @UseGuards(SessionGuard, CsrfGuard)
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { redirectUrl } = await this.auth.logout(req, res);
    res.redirect(302, redirectUrl);
  }
}
