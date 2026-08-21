import { randomUUID } from 'node:crypto';
import { Module, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { trace } from '@opentelemetry/api';
import type { NodeEnvironment } from '../config/env.validation';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const environment = config.get<NodeEnvironment>(
          'NODE_ENV',
          'development',
        );
        return {
          forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
          pinoHttp: {
            level: environment === 'production' ? 'info' : 'debug',
            customProps: () => {
              const span = trace.getActiveSpan();
              if (!span) return {};
              const spanContext = span.spanContext();
              return {
                traceId: spanContext.traceId,
                spanId: spanContext.spanId,
              };
            },
            genReqId: (request: { headers: Record<string, unknown> }) => {
              const value = request.headers['x-correlation-id'];
              return typeof value === 'string' && value.length > 0
                ? value
                : randomUUID();
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-api-key"]',
                'res.headers["set-cookie"]',
              ],
              censor: '[REDACTED]',
            },
            transport:
              environment === 'development'
                ? {
                    target: 'pino-pretty',
                    options: { colorize: false, singleLine: true },
                  }
                : undefined,
          },
        };
      },
    }),
  ],
  exports: [LoggerModule],
})
export class ApplicationLoggerModule {}
