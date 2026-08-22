import type { Response } from 'express';
import type { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../config/env.validation';

export function readSessionCookie(
  header: string | undefined,
  cookieName: string,
): string | null {
  if (!header) return null;
  const name = escapeRegExp(cookieName);
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function setSessionCookie(
  response: Response,
  cookieValue: string,
  config: ConfigService<ValidatedEnvironment, true>,
): void {
  const name = config.getOrThrow<string>('SESSION_COOKIE_NAME');
  const maxAge = config.getOrThrow<number>('SESSION_ABSOLUTE_TTL_SECONDS');
  const parts = [
    `${name}=${encodeURIComponent(cookieValue)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (config.getOrThrow<boolean>('SESSION_SECURE_COOKIE')) parts.push('Secure');
  response.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(
  response: Response,
  config: ConfigService<ValidatedEnvironment, true>,
): void {
  const name = config.getOrThrow<string>('SESSION_COOKIE_NAME');
  const parts = [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (config.getOrThrow<boolean>('SESSION_SECURE_COOKIE')) parts.push('Secure');
  response.append('Set-Cookie', parts.join('; '));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
