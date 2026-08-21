import { context, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { correlationContext } from '../../common/middleware/correlation-context';
import {
  attachQueueTelemetry,
  extractQueueTraceContext,
  QUEUE_TELEMETRY_FIELD,
  readQueueTelemetry,
} from './queue-telemetry';

describe('queue telemetry propagation', () => {
  beforeAll(() => {
    context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable(),
    );
  });

  it('preserves correlation ID and W3C trace parent through job metadata', () => {
    const provider = new BasicTracerProvider();
    const span = provider
      .getTracer('queue-telemetry-test')
      .startSpan('api.request');
    const payload = correlationContext.run(
      { correlationId: 'correlation-test-123' },
      () =>
        context.with(trace.setSpan(context.active(), span), () =>
          attachQueueTelemetry({ outboxMessageId: 'outbox-test-123' }),
        ),
    );
    span.end();

    const telemetry = readQueueTelemetry(payload[QUEUE_TELEMETRY_FIELD]);
    expect(telemetry?.correlationId).toBe('correlation-test-123');
    expect(telemetry?.traceContext?.traceparent).toBeDefined();

    const extracted = extractQueueTraceContext(
      ROOT_CONTEXT,
      telemetry?.traceContext ?? {},
    );
    expect(trace.getSpanContext(extracted)?.traceId).toBe(
      span.spanContext().traceId,
    );
  });
});
