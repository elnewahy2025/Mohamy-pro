import { ConfigService } from '@nestjs/config';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('registers required metric families and records bounded observability data', async () => {
    const service = new MetricsService(
      new ConfigService({ METRICS_ENABLED: true }),
    );

    service.recordHttpRequest('get', '/api/v1/health/live', 200, 12);
    service.recordHttpRequest('DELETE', '/secret/value', 700, 4);
    service.recordDatabaseQuery(8, 'SELECT');
    service.recordDatabaseError('database');
    service.setQueueDepth('mohamy-application', { waiting: 3, active: 1 });
    service.setOutboxStateCounts({ PENDING: 2, DEAD_LETTER: 1 });
    service.observeWorkerJob('outbox.dispatch', 19);
    service.recordApplicationError('server_error');
    service.recordApplicationError('rate_limit');

    const output = await service.render();

    expect(output).toContain('mohamy_http_requests_total');
    expect(output).toContain('method="GET"');
    expect(output).toContain('status_code="200"');
    expect(output).toContain('mohamy_http_request_duration_seconds');
    expect(output).toContain('mohamy_database_query_duration_seconds');
    expect(output).toContain('mohamy_database_errors_total');
    expect(output).toContain('mohamy_queue_depth');
    expect(output).toContain('mohamy_outbox_state_count');
    expect(output).toContain('mohamy_worker_job_duration_seconds');
    expect(output).toContain('mohamy_application_errors_total');
    expect(output).toContain('error_type="rate_limit"');
    expect(output).not.toContain('status_code="700"');
  });

  it('does not expose application metrics when disabled', async () => {
    const service = new MetricsService(
      new ConfigService({ METRICS_ENABLED: false }),
    );

    service.recordHttpRequest('GET', '/api/v1/health/live', 200, 12);

    expect(await service.render()).not.toContain('mohamy_http_requests_total');
  });
});
