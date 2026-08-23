import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getCorrelationId } from '../middleware/correlation-id.middleware';
import { MetricsService } from '../../observability/metrics.service';
import {
  createErrorEnvelope,
  type ApiErrorEnvelope,
  isOidcRedirectRequest,
  isOperationalRequest,
  statusForException,
} from '../http/api-envelope';

interface LegacyErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  method: string;
  timestamp: string;
  correlationId: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly metrics?: MetricsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const correlationId = getCorrelationId(request);
    const timestamp = new Date().toISOString();
    const status = statusForException(exception);

    if (status >= 400) {
      this.metrics?.recordApplicationError(
        status >= 500 ? 'server_error' : 'client_error',
      );
    }

    if (status >= 500) {
      this.logger.error(
        {
          correlationId,
          method: request.method,
          path: request.originalUrl,
          exception,
        },
        'Unhandled request exception',
      );
    }

    if (
      isOperationalRequest(request) ||
      isOidcRedirectRequest(request) ||
      isServiceInfoRequest(request)
    ) {
      response
        .status(status)
        .json(legacyErrorBody(exception, request, timestamp));
      return;
    }

    const errorEnvelope =
      (request as Request & { phase2ErrorEnvelope?: ApiErrorEnvelope })
        .phase2ErrorEnvelope ??
      createErrorEnvelope(exception, request, timestamp);
    response.status(status).json(errorEnvelope);
  }
}

function legacyErrorBody(
  exception: unknown,
  request: Request,
  timestamp: string,
): LegacyErrorResponseBody {
  const status = statusForException(exception);
  const rawResponse =
    exception instanceof HttpException ? exception.getResponse() : undefined;
  const rawMessage =
    typeof rawResponse === 'object' &&
    rawResponse !== null &&
    'message' in rawResponse
      ? rawResponse.message
      : typeof rawResponse === 'string'
        ? rawResponse
        : undefined;
  const message: string | string[] =
    status >= 500
      ? 'Internal server error'
      : typeof rawMessage === 'string'
        ? rawMessage
        : Array.isArray(rawMessage) &&
            rawMessage.every((item): item is string => typeof item === 'string')
          ? rawMessage
          : 'Request failed';
  return {
    statusCode: status,
    error: HttpStatus[status] ?? 'HTTP_ERROR',
    message,
    path: request.originalUrl,
    method: request.method,
    timestamp,
    correlationId: getCorrelationId(request),
  };
}

function isServiceInfoRequest(request: Request): boolean {
  const path = request.originalUrl.split('?', 1)[0];
  return path === '/api/v1' || path === '/api/v1/';
}
