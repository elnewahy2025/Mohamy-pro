import 'reflect-metadata';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { SuccessEnvelopeInterceptor } from './common/api/success-envelope.interceptor';
import { IdempotencyInterceptor } from './common/api/idempotency.interceptor';
import { IdempotencyService } from './infrastructure/idempotency/idempotency.service';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { MetricsMiddleware } from './observability/metrics.middleware';
import { MetricsService } from './observability/metrics.service';
import { RateLimitMiddleware } from './security/rate-limit.middleware';
import { shutdownTelemetry, startTelemetry } from './observability/tracing';

async function bootstrap(): Promise<void> {
  startTelemetry();
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  app.useLogger(app.get(Logger));
  const correlationIdMiddleware = app.get(CorrelationIdMiddleware);
  app.use(correlationIdMiddleware.use.bind(correlationIdMiddleware));
  const metricsMiddleware = app.get(MetricsMiddleware);
  app.use(metricsMiddleware.use.bind(metricsMiddleware));
  const rateLimitMiddleware = app.get(RateLimitMiddleware);
  app.use(rateLimitMiddleware.use.bind(rateLimitMiddleware));
  app.use(helmet());
  app.enableCors({
    origin: config
      .get<string>('CORS_ORIGINS', 'http://localhost:5173')
      .split(','),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(app.get(MetricsService)));
  app.useGlobalInterceptors(
    new IdempotencyInterceptor(app.get(IdempotencyService)),
    new SuccessEnvelopeInterceptor(),
  );

  if (config.get<string>('NODE_ENV', 'development') !== 'production') {
    const openApiConfig = new DocumentBuilder()
      .setTitle('Mohamy Pro API')
      .setDescription(
        'Production API foundation for the Mohamy legal operations platform.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, openApiConfig);
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
    });
  }

  const port = config.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await app.close();
    await shutdownTelemetry();
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

void bootstrap().catch(async (error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`API failed to start: ${message}`);
  await shutdownTelemetry();
  process.exitCode = 1;
});
