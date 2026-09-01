import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import helmet from 'helmet';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ContractTestModule } from './contract/contract.module';
import { CorrelationIdMiddleware } from '../src/common/middleware/correlation-id.middleware';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { SuccessEnvelopeInterceptor } from '../src/common/api/success-envelope.interceptor';
import { IdempotencyInterceptor } from '../src/common/api/idempotency.interceptor';
import { IdempotencyService } from '../src/infrastructure/idempotency/idempotency.service';
import { MetricsService } from '../src/observability/metrics.service';
import { InMemoryIdempotencyService } from './contract/in-memory-idempotency.service';

const KEY = (n: number): string =>
  `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

// Supertest types response.body as `any`; route it through `unknown` so the
// type-aware lint rules treat the assignment as safe.
function cast<T>(value: unknown): T {
  return value as T;
}

interface SuccessEnvelope {
  success: true;
  data: Record<string, unknown>;
  meta: { requestId: string; timestamp: string; pagination: unknown };
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; details: unknown[] };
  meta: { requestId: string; timestamp: string };
}

describe('Phase 2 API contract (e2e)', () => {
  let app: INestApplication;

  function http(): ReturnType<typeof request> {
    // Supertest's Nest adapter is typed as an opaque HTTP server by Nest.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return request(app.getHttpServer());
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [ContractTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    const correlationIdMiddleware = app.get(CorrelationIdMiddleware);
    app.use(correlationIdMiddleware.use.bind(correlationIdMiddleware));
    app.use(helmet());
    app.enableCors({ origin: 'http://localhost:5173', credentials: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter(app.get(MetricsService)));
    app.useGlobalInterceptors(
      new IdempotencyInterceptor(app.get(IdempotencyService)),
      new SuccessEnvelopeInterceptor(),
    );

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('success envelope contract', () => {
    it('wraps a business response in the frozen {success,data,meta} shape', async () => {
      const correlationId = 'contract-correlation-001';
      const response = await http()
        .get('/api/v1/contract/echo')
        .set('x-correlation-id', correlationId)
        .expect(200);

      const body = cast<SuccessEnvelope>(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 'contract-echo' });
      expect(body.meta.requestId).toBe(correlationId);
      expect(typeof body.meta.timestamp).toBe('string');
      expect(body.meta.pagination).toBeNull();
      expect(response.headers['x-correlation-id']).toBe(correlationId);
    });

    it('echos a client correlation id on the response header', async () => {
      const correlationId = 'contract-correlation-002';
      const response = await http()
        .get('/api/v1/contract/echo')
        .set('x-correlation-id', correlationId)
        .expect(200);
      expect(response.headers['x-correlation-id']).toBe(correlationId);
    });
  });

  describe('error envelope contract', () => {
    it('renders the frozen {success:false,error,meta} shape for a controlled error', async () => {
      const correlationId = 'contract-correlation-003';
      const response = await http()
        .get('/api/v1/contract/not-found')
        .set('x-correlation-id', correlationId)
        .expect(404);

      const body = cast<ErrorEnvelope>(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Contract resource not found');
      expect(body.error.details).toEqual([]);
      expect(body.meta.requestId).toBe(correlationId);
      expect(body.meta.timestamp).toEqual(expect.any(String));
    });

    it('does not leak an internal error message to the client', async () => {
      const response = await http()
        .get('/api/v1/contract/not-found')
        .expect(404);
      const body = cast<ErrorEnvelope>(response.body);
      expect(JSON.stringify(body)).not.toContain('stack');
    });
  });

  describe('validation contract', () => {
    it('rejects an unknown property as a whitelist violation', async () => {
      const response = await http()
        .post('/api/v1/contract/resource')
        .set('Idempotency-Key', KEY(1))
        .send({ name: 'x', illegal: true })
        .expect(400);

      const body = cast<ErrorEnvelope>(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.details).toEqual(
        expect.arrayContaining([expect.stringContaining('should not exist')]),
      );
    });

    it('rejects an invalid typed property with a validation envelope', async () => {
      const response = await http()
        .post('/api/v1/contract/resource')
        .set('Idempotency-Key', KEY(2))
        .send({ name: '', count: -1 })
        .expect(400);

      const body = cast<ErrorEnvelope>(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.details.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('idempotency contract', () => {
    it('requires an Idempotency-Key header on mutations', async () => {
      const response = await http()
        .post('/api/v1/contract/resource')
        .send({ name: 'x' })
        .expect(422);

      const body = cast<ErrorEnvelope>(response.body);
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.message).toContain('Missing required header');
    });

    it('rejects a non-UUIDv4 key with a validation envelope', async () => {
      const response = await http()
        .post('/api/v1/contract/resource')
        .set('Idempotency-Key', 'not-a-uuid')
        .send({ name: 'x' })
        .expect(422);

      const body = cast<ErrorEnvelope>(response.body);
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.message).toContain('must be a UUIDv4 value');
    });

    it('executes a fresh reservation and echoes the key header', async () => {
      const response = await http()
        .post('/api/v1/contract/resource')
        .set('Idempotency-Key', KEY(3))
        .send({ name: 'fresh' })
        .expect(201);

      expect(response.headers['idempotency-key']).toBe(KEY(3));
      const body = cast<SuccessEnvelope>(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 'resource-1', name: 'fresh' });
    });

    it('replays a completed record without invoking the handler again', async () => {
      const key = KEY(4);
      const first = await http()
        .post('/api/v1/contract/resource')
        .set('Idempotency-Key', key)
        .send({ name: 'replay-target' })
        .expect(201);
      const firstBody = cast<SuccessEnvelope>(first.body);

      const replay = await http()
        .post('/api/v1/contract/resource')
        .set('Idempotency-Key', key)
        .send({ name: 'replay-target' })
        .expect(201);

      expect(replay.headers['idempotency-key']).toBe(key);
      const replayBody = cast<SuccessEnvelope>(replay.body);
      expect(replayBody.success).toBe(true);
      expect(replayBody.data).toEqual(firstBody.data);
      expect(replayBody.data).toEqual({
        id: 'resource-1',
        name: 'replay-target',
      });
    });

    it('returns a conflict when a key is reused with a different payload', async () => {
      const key = KEY(5);
      await http()
        .post('/api/v1/contract/resource')
        .set('Idempotency-Key', key)
        .send({ name: 'payload-a' })
        .expect(201);

      const conflict = await http()
        .post('/api/v1/contract/resource')
        .set('Idempotency-Key', key)
        .send({ name: 'payload-b' })
        .expect(409);

      const body = cast<ErrorEnvelope>(conflict.body);
      expect(body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('returns in_progress for a still-reserved key', async () => {
      const key = KEY(6);
      await http()
        .post('/api/v1/contract/resource')
        .set('Idempotency-Key', key)
        .send({ name: 'running' })
        .expect(201);

      const store = cast<InMemoryIdempotencyService>(
        app.get(IdempotencyService),
      );
      store.setState(key, 'RESERVED');

      const stalled = await http()
        .post('/api/v1/contract/resource')
        .set('Idempotency-Key', key)
        .send({ name: 'running' })
        .expect(409);

      const body = cast<ErrorEnvelope>(stalled.body);
      expect(body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    });
  });
});
