import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { ValidatedEnvironment } from '../../config/env.validation';

const OIDC_COOKIE = 'mohamy_oidc';
const OIDC_COOKIE_TTL_SECONDS = 15 * 60;

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  maxAgeSeconds: number;
}

@Injectable()
export class SessionCookieService {
  constructor(
    private readonly configService: ConfigService<ValidatedEnvironment, true>,
  ) {}

  private sessionCookieName(): string {
    return this.configService.getOrThrow('SESSION_COOKIE_NAME');
  }

  private secureFlag(): boolean {
    return this.configService.getOrThrow('SESSION_SECURE_COOKIE');
  }

  private baseOptions(maxAgeSeconds: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secureFlag(),
      sameSite: 'lax',
      maxAgeSeconds,
    };
  }

  readSession(req: Request): string | null {
    return this.read(req, this.sessionCookieName());
  }

  setSession(res: Response, value: string, maxAgeSeconds: number): void {
    this.set(
      res,
      this.sessionCookieName(),
      value,
      this.baseOptions(maxAgeSeconds),
    );
  }

  clearSession(res: Response): void {
    res.clearCookie(this.sessionCookieName(), { path: '/' });
  }

  readOidc(req: Request): string | null {
    return this.read(req, OIDC_COOKIE);
  }

  setOidc(res: Response, value: string): void {
    this.set(
      res,
      OIDC_COOKIE,
      value,
      this.baseOptions(OIDC_COOKIE_TTL_SECONDS),
    );
  }

  clearOidc(res: Response): void {
    res.clearCookie(OIDC_COOKIE, { path: '/' });
  }

  private read(req: Request, name: string): string | null {
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
      const index = part.indexOf('=');
      if (index === -1) continue;
      const key = part.slice(0, index).trim();
      if (key === name) {
        const value = part.slice(index + 1).trim();
        return value === '' ? null : value;
      }
    }
    return null;
  }

  private set(
    res: Response,
    name: string,
    value: string,
    options: CookieOptions,
  ): void {
    res.cookie(name, value, {
      httpOnly: options.httpOnly,
      secure: options.secure,
      sameSite: options.sameSite,
      path: '/',
      maxAge: options.maxAgeSeconds * 1000,
    });
  }
}
