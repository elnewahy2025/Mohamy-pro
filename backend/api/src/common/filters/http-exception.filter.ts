import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getCorrelationId } from '../middleware/correlation-id.middleware';
import { ApiError } from '../api/api-error';
import { MetricsService } from '../../observability/metrics.service';
import {
  ERROR_CODES,
  codeForHttpStatus,
  defaultMessageForCode,
  type ErrorCode,
} from '../api/error-codes';
import type { ApiErrorEnvelope } from '../api/envelope';

function validationDetails(exception: BadRequestException): string[] | null {
  const raw = exception.getResponse();
  const message =
    typeof raw === 'object' && raw !== null && 'message' in raw
      ? raw.message
      : raw;
  if (
    Array.isArray(message) &&
    message.every((item) => typeof item === 'string')
  ) {
    return message;
  }
  return null;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly metrics?: MetricsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = getCorrelationId(request);
    const timestamp = new Date().toISOString();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let code: ErrorCode;
    let message: string | string[];
    let details: unknown[] = [];

    if (exception instanceof ApiError) {
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof BadRequestException) {
      const validation = validationDetails(exception);
      if (validation) {
        code = ERROR_CODES.VALIDATION_FAILED;
        message = 'The provided input is invalid.';
        details = validation;
      } else {
        code = ERROR_CODES.BAD_REQUEST;
        message = 'The request is malformed.';
        details = [];
      }
    } else if (exception instanceof HttpException) {
      code =
        exception.getStatus() === 409
          ? ERROR_CODES.CONFLICT
          : codeForHttpStatus(exception.getStatus(), 'BAD_REQUEST');
      const raw = exception.getResponse();
      const rawMessage =
        typeof raw === 'object' &&
        raw !== null &&
        'message' in raw &&
        typeof raw.message === 'string'
          ? (raw as { message: string }).message
          : undefined;
      message =
        status >= 500
          ? 'Internal server error'
          : (rawMessage ?? defaultMessageForCode(code));
    } else {
      code = ERROR_CODES.INTERNAL_ERROR;
      message = 'Internal server error';
    }

    if (status >= 400) {
      this.metrics?.recordApplicationError(
        status >= 500 ? 'server_error' : 'client_error',
      );
    }

    if (status >= 500) {
      this.logger.error(
        {
          requestId,
          method: request.method,
          path: request.originalUrl,
          exception,
        },
        'Unhandled request exception',
      );
    }

    const errorEnvelope: ApiErrorEnvelope = {
      success: false,
      error: {
        code,
        message: Array.isArray(message) ? message.join('; ') : message,
        details,
      },
      meta: { requestId, timestamp },
    };

    if (status === 429) {
      response.setHeader('Retry-After', String(1));
    }

    response.status(status).json(errorEnvelope);
  }
}
