import {
  context,
  defaultTextMapGetter,
  defaultTextMapSetter,
  type Context,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { getActiveCorrelationId } from '../../common/middleware/correlation-context';

export interface QueueTelemetryMetadata {
  correlationId?: string;
  traceContext?: Record<string, string>;
}

export const QUEUE_TELEMETRY_FIELD = '__mohamyTelemetry';
const w3cPropagator = new W3CTraceContextPropagator();

export function attachQueueTelemetry<T extends Record<string, unknown>>(
  payload: T,
): T {
  const traceContext: Record<string, string> = {};
  w3cPropagator.inject(context.active(), traceContext, defaultTextMapSetter);
  const correlationId = getActiveCorrelationId();
  const telemetry: QueueTelemetryMetadata = {
    ...(correlationId ? { correlationId } : {}),
    ...(Object.keys(traceContext).length > 0 ? { traceContext } : {}),
  };
  return {
    ...payload,
    [QUEUE_TELEMETRY_FIELD]: telemetry,
  };
}

export function extractQueueTraceContext(
  parentContext: Context,
  carrier: Record<string, string>,
): Context {
  return w3cPropagator.extract(parentContext, carrier, defaultTextMapGetter);
}

export function readQueueTelemetry(
  value: unknown,
): QueueTelemetryMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<QueueTelemetryMetadata>;
  const correlationId =
    typeof candidate.correlationId === 'string' &&
    candidate.correlationId.length <= 256
      ? candidate.correlationId
      : undefined;
  const traceContext =
    candidate.traceContext && typeof candidate.traceContext === 'object'
      ? Object.fromEntries(
          Object.entries(candidate.traceContext).filter(
            ([key, item]) =>
              (key === 'traceparent' || key === 'tracestate') &&
              typeof item === 'string' &&
              item.length <= 512,
          ),
        )
      : undefined;
  return correlationId || (traceContext && Object.keys(traceContext).length > 0)
    ? { correlationId, traceContext }
    : undefined;
}
