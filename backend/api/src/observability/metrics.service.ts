import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import type { ValidatedEnvironment } from '../config/env.validation';

export const OUTBOX_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
  'DEAD_LETTER',
] as const;

export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

const HTTP_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

const DATABASE_OPERATIONS = new Set([
  'select',
  'insert',
  'update',
  'delete',
  'transaction',
  'other',
]);

const WORKER_JOB_NAMES = new Set(['outbox.dispatch']);

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly enabled: boolean;

  private readonly httpRequestsTotal: Counter<
    'method' | 'route' | 'status_code'
  >;
  private readonly httpRequestDurationSeconds: Histogram<
    'method' | 'route' | 'status_code'
  >;
  private readonly databaseQueryDurationSeconds: Histogram<'operation'>;
  private readonly databaseErrorsTotal: Counter<'error_type'>;
  private readonly queueDepth: Gauge<'queue_name' | 'state'>;
  private readonly outboxStateCount: Gauge<'status'>;
  private readonly readinessStatus: Gauge<'dependency'>;
  private readonly workerJobDurationSeconds: Histogram<'job_name'>;
  private readonly applicationErrorsTotal: Counter<'error_type'>;

  constructor(config: ConfigService<ValidatedEnvironment, true>) {
    this.enabled = config.get<boolean>('METRICS_ENABLED', true);

    this.httpRequestsTotal = new Counter({
      name: 'mohamy_http_requests_total',
      help: 'Total number of HTTP requests handled by the API.',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
    this.httpRequestDurationSeconds = new Histogram({
      name: 'mohamy_http_request_duration_seconds',
      help: 'HTTP request duration in seconds.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
    this.databaseQueryDurationSeconds = new Histogram({
      name: 'mohamy_database_query_duration_seconds',
      help: 'Database query duration in seconds by bounded operation type.',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });
    this.databaseErrorsTotal = new Counter({
      name: 'mohamy_database_errors_total',
      help: 'Database errors by bounded error category.',
      labelNames: ['error_type'],
      registers: [this.registry],
    });
    this.queueDepth = new Gauge({
      name: 'mohamy_queue_depth',
      help: 'Current BullMQ queue depth by queue and state.',
      labelNames: ['queue_name', 'state'],
      registers: [this.registry],
    });
    this.readinessStatus = new Gauge({
      name: 'mohamy_readiness_status',
      help: 'Readiness state by dependency; one means up and zero means down.',
      labelNames: ['dependency'],
      registers: [this.registry],
    });
    this.outboxStateCount = new Gauge({
      name: 'mohamy_outbox_state_count',
      help: 'Current number of outbox messages by lifecycle state.',
      labelNames: ['status'],
      registers: [this.registry],
    });
    this.workerJobDurationSeconds = new Histogram({
      name: 'mohamy_worker_job_duration_seconds',
      help: 'Worker job duration in seconds by bounded job name.',
      labelNames: ['job_name'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers: [this.registry],
    });
    this.applicationErrorsTotal = new Counter({
      name: 'mohamy_application_errors_total',
      help: 'Application errors by bounded category.',
      labelNames: ['error_type'],
      registers: [this.registry],
    });

    if (this.enabled) {
      collectDefaultMetrics({
        register: this.registry,
        prefix: 'mohamy_',
      });
    }
  }

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number,
  ): void {
    if (!this.enabled) return;
    const labels = {
      method: normalizeMethod(method),
      route: normalizeRoute(route),
      status_code: normalizeStatusCode(statusCode),
    };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(
      labels,
      Math.max(0, durationMs) / 1_000,
    );
  }

  recordDatabaseQuery(durationMs: number, operation: string): void {
    if (!this.enabled) return;
    this.databaseQueryDurationSeconds
      .labels(normalizeDatabaseOperation(operation))
      .observe(Math.max(0, durationMs) / 1_000);
  }

  recordDatabaseError(errorType: string): void {
    if (!this.enabled) return;
    this.databaseErrorsTotal.labels(normalizeErrorType(errorType)).inc();
  }

  setQueueDepth(queueName: string, counts: Record<string, number>): void {
    if (!this.enabled) return;
    const boundedQueueName = normalizeQueueName(queueName);
    for (const state of [
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
    ]) {
      this.queueDepth
        .labels(boundedQueueName, state)
        .set(Math.max(0, Number(counts[state] ?? 0)));
    }
  }

  recordOutboxStateTransition(
    from: string | undefined,
    to: OutboxStatus,
  ): void {
    if (!this.enabled) return;
    if (from && isOutboxStatus(from)) {
      this.outboxStateCount.labels(from).dec();
    }
    this.outboxStateCount.labels(to).inc();
  }

  setReadinessStatus(dependency: string, status: 'up' | 'down'): void {
    if (!this.enabled) return;
    this.readinessStatus
      .labels(normalizeDependency(dependency))
      .set(status === 'up' ? 1 : 0);
  }

  setOutboxStateCounts(counts: Record<string, number>): void {
    if (!this.enabled) return;
    for (const status of OUTBOX_STATUSES) {
      this.outboxStateCount
        .labels(status)
        .set(Math.max(0, Number(counts[status] ?? 0)));
    }
  }

  observeWorkerJob(jobName: string, durationMs: number): void {
    if (!this.enabled) return;
    this.workerJobDurationSeconds
      .labels(normalizeWorkerJobName(jobName))
      .observe(Math.max(0, durationMs) / 1_000);
  }

  recordApplicationError(errorType: string): void {
    if (!this.enabled) return;
    this.applicationErrorsTotal.labels(normalizeErrorType(errorType)).inc();
  }

  async render(): Promise<string> {
    return this.enabled ? this.registry.metrics() : '';
  }
}

function normalizeMethod(method: string): string {
  const normalized = method.toUpperCase();
  return HTTP_METHODS.has(normalized) ? normalized : 'OTHER';
}

function normalizeRoute(route: string): string {
  if (!route || route === 'unknown') return 'unknown';
  const normalized = route.trim().replace(/\\s+/g, ' ');
  return normalized.length > 120 ? normalized.slice(0, 120) : normalized;
}

function normalizeStatusCode(statusCode: number): string {
  return Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599
    ? String(statusCode)
    : '500';
}

function normalizeDatabaseOperation(operation: string): string {
  const normalized = operation.toLowerCase();
  if (DATABASE_OPERATIONS.has(normalized)) return normalized;
  if (/^select\\b/i.test(operation)) return 'select';
  if (/^insert\\b/i.test(operation)) return 'insert';
  if (/^update\\b/i.test(operation)) return 'update';
  if (/^delete\\b/i.test(operation)) return 'delete';
  return 'other';
}

function normalizeDependency(dependency: string): string {
  return ['postgres', 'redis', 'queue', 'objectStorage'].includes(dependency)
    ? dependency
    : 'other';
}

function normalizeQueueName(queueName: string): string {
  return queueName === 'mohamy-application' ? queueName : 'other';
}

function normalizeWorkerJobName(jobName: string): string {
  return WORKER_JOB_NAMES.has(jobName) ? jobName : 'other';
}

function normalizeErrorType(errorType: string): string {
  const normalized = errorType.toLowerCase();
  if (normalized === 'client_error') return 'client_error';
  if (normalized === 'server_error') return 'server_error';
  if (normalized === 'database') return 'database';
  if (normalized === 'queue') return 'queue';
  if (normalized === 'outbox') return 'outbox';
  if (normalized === 'rate_limit') return 'rate_limit';
  return 'other';
}

function isOutboxStatus(value: string): value is OutboxStatus {
  return (OUTBOX_STATUSES as readonly string[]).includes(value);
}
