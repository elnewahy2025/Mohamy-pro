import type { Request } from 'express';
import { HttpException, HttpStatus } from '@nestjs/common';

export interface ApiResponseMeta {
  requestId: string;
  timestamp: string;
  pagination: null;
}

export interface ApiSuccessEnvelope<T = unknown> {
  success: true;
  data: T;
  meta: ApiResponseMeta;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details: string[];
  };
  meta: Omit<ApiResponseMeta, 'pagination'>;
}

const ERROR_MESSAGES: Record<string, string> = {
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  AUTHENTICATION_FAILED: 'Authentication failed.',
  AUTHENTICATION_PROVIDER_UNAVAILABLE:
    'The authentication provider is temporarily unavailable.',
  CSRF_INVALID: 'Request security validation failed.',
  ORIGIN_NOT_ALLOWED: 'Request origin is not allowed.',
  IDEMPOTENCY_KEY_INVALID: 'A valid idempotency key is required.',
  IDEMPOTENCY_CONFLICT: 'The idempotency key conflicts with another request.',
  IDEMPOTENCY_IN_PROGRESS: 'An equivalent request is already in progress.',
  TENANT_CONTEXT_REQUIRED: 'A valid tenant membership is required.',
  TENANT_SWITCH_CONFLICT:
    'The session context changed; retry with a new request.',
  FORBIDDEN: 'The requested operation is not permitted.',

  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'The request conflicts with the current state.',
  RATE_LIMITED: 'Too many requests.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable.',
  VALIDATION_FAILED: 'The provided input is invalid.',
  INTERNAL_SERVER_ERROR: 'Internal server error.',
};

export function createSuccessEnvelope<T>(
  data: T,
  request: Request,
  timestamp = new Date().toISOString(),
): ApiSuccessEnvelope<T> {
  return {
    success: true,
    data,
    meta: {
      requestId: requestId(request),
      timestamp,
      pagination: null,
    },
  };
}

export function createErrorEnvelope(
  exception: unknown,
  request: Request,
  timestamp = new Date().toISOString(),
): ApiErrorEnvelope {
  const status =
    exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  const rawResponse =
    exception instanceof HttpException ? exception.getResponse() : undefined;
  const rawMessage = readRawMessage(rawResponse);
  const code = resolveErrorCode(status, rawResponse, rawMessage);
  const details =
    Array.isArray(rawMessage) &&
    rawMessage.every((item): item is string => typeof item === 'string')
      ? rawMessage
      : [];
  return {
    success: false,
    error: {
      code,
      message: ERROR_MESSAGES[code] ?? ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      details,
    },
    meta: {
      requestId: requestId(request),
      timestamp,
    },
  };
}

export function statusForException(exception: unknown): number {
  return exception instanceof HttpException
    ? exception.getStatus()
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

export function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { success?: unknown }).success === false &&
    'error' in value &&
    'meta' in value
  );
}

export function isApiSuccessEnvelope(
  value: unknown,
): value is ApiSuccessEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { success?: unknown }).success === true &&
    'data' in value &&
    'meta' in value
  );
}

export function isOperationalRequest(request: Request): boolean {
  const path = request.originalUrl.split('?', 1)[0];
  return (
    path === '/api/v1' ||
    path === '/api/v1/' ||
    path === '/api/v1/health' ||
    path === '/api/v1/health/live' ||
    path === '/api/v1/health/ready' ||
    path === '/api/metrics' ||
    path === '/api/docs-json' ||
    path === '/api/docs-json/'
  );
}

export function isOidcRedirectRequest(request: Request): boolean {
  const path = request.originalUrl.split('?', 1)[0];
  return path === '/api/v1/auth/login' || path === '/api/v1/auth/callback';
}

function readRawMessage(rawResponse: unknown): unknown {
  if (typeof rawResponse === 'string') return rawResponse;
  if (
    typeof rawResponse === 'object' &&
    rawResponse !== null &&
    'message' in rawResponse
  ) {
    return (rawResponse as { message?: unknown }).message;
  }
  return undefined;
}

function resolveErrorCode(
  status: number,
  rawResponse: unknown,
  rawMessage: unknown,
): string {
  if (
    typeof rawResponse === 'object' &&
    rawResponse !== null &&
    'code' in rawResponse &&
    typeof (rawResponse as { code?: unknown }).code === 'string'
  ) {
    return (rawResponse as { code: string }).code;
  }
  if (typeof rawMessage === 'string' && /^[A-Z][A-Z0-9_]+$/.test(rawMessage)) {
    return rawMessage;
  }
  if (status === 400) return 'VALIDATION_FAILED';
  if (status === 401) return 'AUTHENTICATION_REQUIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  return 'INTERNAL_SERVER_ERROR';
}

function requestId(request: Request): string {
  const value = request.header('x-correlation-id')?.trim();
  return value || 'unknown';
}
