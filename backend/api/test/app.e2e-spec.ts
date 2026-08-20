import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';

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
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
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
