import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { CorrelationIdMiddleware } from './../src/common/middleware/correlation-id.middleware';
import { MetricsMiddleware } from './../src/observability/metrics.middleware';
import { RateLimitMiddleware } from './../src/security/rate-limit.middleware';

describe('Phase 1 API contract (e2e)', () => {
  let app: INestApplication;

  function http(): ReturnType<typeof request> {
    // Supertest's Nest adapter is typed as an opaque HTTP server by Nest.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return request(app.getHttpServer());
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const correlationIdMiddleware = app.get(CorrelationIdMiddleware);
    app.use(correlationIdMiddleware.use.bind(correlationIdMiddleware));
    const metricsMiddleware = app.get(MetricsMiddleware);
    app.use(metricsMiddleware.use.bind(metricsMiddleware));
    const rateLimitMiddleware = app.get(RateLimitMiddleware);
    app.use(rateLimitMiddleware.use.bind(rateLimitMiddleware));
    app.use(helmet());
    app.enableCors({
      origin: 'http://localhost:5173',
      credentials: false,
    });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
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
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports liveness through the versioned API contract', async () => {
    const response = await http().get('/api/v1/health/live').expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
    expect(response.headers['x-correlation-id']).toBeDefined();
  });

  it('reports readiness with every declared dependency', async () => {
    const response = await http().get('/api/v1/health/ready').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      checks: {
        postgres: { status: 'up' },
        redis: { status: 'up' },
        queue: { status: 'up' },
        objectStorage: { status: 'up' },
      },
    });
  });

  it('publishes protected Prometheus metrics at the documented path', async () => {
    const response = await http().get('/api/metrics').expect(200);

    expect(response.text).toContain('mohamy_http_requests_total');
    expect(response.text).toContain('mohamy_outbox_state_count');
  });

  it('publishes the OpenAPI document at the documented path', async () => {
    const response = await http().get('/api/docs-json').expect(200);

    const document = response.body as unknown as {
      openapi?: unknown;
      paths?: Record<string, unknown>;
    };
    expect(typeof document.openapi).toBe('string');
    expect(document.paths).toBeDefined();
    expect(document.paths?.['/api/v1/health/live']).toBeDefined();
  });
});
