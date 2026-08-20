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

interface ErrorResponseBody {
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

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const correlationId = getCorrelationId(request);
    const timestamp = new Date().toISOString();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawResponse = exception instanceof HttpException
      ? exception.getResponse()
      : undefined;
    const rawMessage = typeof rawResponse === 'object' && rawResponse !== null && 'message' in rawResponse
      ? rawResponse.message
      : typeof rawResponse === 'string'
        ? rawResponse
        : undefined;
    const message: string | string[] = status >= 500
      ? 'Internal server error'
      : typeof rawMessage === 'string'
        ? rawMessage
        : Array.isArray(rawMessage) && rawMessage.every((item): item is string => typeof item === 'string')
          ? rawMessage
          : 'Request failed';

    if (status >= 500) {
      this.logger.error({
        correlationId,
        method: request.method,
        path: request.originalUrl,
        exception,
      }, 'Unhandled request exception');
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      error: HttpStatus[status] ?? 'HTTP_ERROR',
      message,
      path: request.originalUrl,
      method: request.method,
      timestamp,
      correlationId,
    };

    response.status(status).json(body);
  }
}
