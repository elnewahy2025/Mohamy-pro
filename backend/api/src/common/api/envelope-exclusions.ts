import type { Request } from 'express';

const OPERATIONAL_PATH_PATTERNS: RegExp[] = [
  /^\/api\/v1\/health\/live$/,
  /^\/api\/v1\/health\/ready$/,
  /^\/api\/metrics$/,
  /^\/api\/docs$/,
  /^\/api\/docs-json$/,
];

export function isOperationalExclusion(request: Request): boolean {
  const url = request.originalUrl ?? request.url ?? '';
  return OPERATIONAL_PATH_PATTERNS.some((pattern) => pattern.test(url));
}
