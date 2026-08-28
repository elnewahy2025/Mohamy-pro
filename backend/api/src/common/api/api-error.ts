import { HttpException, HttpStatus } from '@nestjs/common';
import {
  ErrorCode,
  codeForHttpStatus,
  defaultMessageForCode,
} from './error-codes';

export interface ApiErrorOptions {
  status?: number;
  code?: ErrorCode;
  message?: string;
  details?: unknown[];
}

export class ApiError extends HttpException {
  readonly code: ErrorCode;
  readonly details: unknown[];

  constructor(options: ApiErrorOptions = {}) {
    const status = options.status ?? HttpStatus.BAD_REQUEST;
    const code = options.code ?? codeForHttpStatus(status, 'BAD_REQUEST');
    super(options.message ?? defaultMessageForCode(code), status);
    this.code = code;
    this.details = options.details ?? [];
  }

  static badRequest(message?: string, details?: unknown[]): ApiError {
    return new ApiError({ status: 400, code: 'BAD_REQUEST', message, details });
  }

  static validationFailed(message?: string, details?: unknown[]): ApiError {
    return new ApiError({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: message ?? 'The provided input is invalid.',
      details,
    });
  }

  static notFound(message?: string): ApiError {
    return new ApiError({ status: 404, code: 'NOT_FOUND', message });
  }

  static idempotencyConflict(): ApiError {
    return new ApiError({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });
  }

  static idempotencyInProgress(): ApiError {
    return new ApiError({ status: 409, code: 'IDEMPOTENCY_IN_PROGRESS' });
  }
}
