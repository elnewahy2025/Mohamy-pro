import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

let sdk: NodeSDK | undefined;

export function startTelemetry(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (process.env.OTEL_ENABLED === 'false' || !endpoint) return;
  if (sdk) return;

  const serviceName =
    process.env.OTEL_SERVICE_NAME?.trim() ||
    (process.env.WORKER_PROCESS === 'true' ? 'mohamy-worker' : 'mohamy-api');

  const traceExporter = endpoint
    ? new OTLPTraceExporter({ url: toTraceEndpoint(endpoint) })
    : undefined;

  sdk = new NodeSDK({
    serviceName,
    ...(traceExporter ? { traceExporter } : {}),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-ioredis': { enabled: true },
        '@opentelemetry/instrumentation-pg': { enabled: true },
      }),
    ],
  });
  sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  const activeSdk = sdk;
  sdk = undefined;
  if (activeSdk) await activeSdk.shutdown();
}

function toTraceEndpoint(endpoint: string): string {
  return endpoint.endsWith('/v1/traces')
    ? endpoint
    : `${endpoint.replace(/\/$/, '')}/v1/traces`;
}
