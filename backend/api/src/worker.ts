import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MetricsService } from './observability/metrics.service';
import { WorkerMetricsServer } from './observability/worker-metrics-server';
import { shutdownTelemetry, startTelemetry } from './observability/tracing';

async function bootstrap(): Promise<void> {
  process.env.WORKER_PROCESS = 'true';
  startTelemetry();
  const { WorkerModule } = await import('./worker.module.js');
  const logger = new Logger('OutboxWorkerBootstrap');
  const application = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: false,
  });
  application.enableShutdownHooks();
  const metrics = application.get(MetricsService);
  const workerMetricsServer = new WorkerMetricsServer(
    application.get(ConfigService),
    metrics,
  );
  await workerMetricsServer.start();
  logger.log('Outbox worker process started');

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await workerMetricsServer.close();
    await application.close();
    await shutdownTelemetry();
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

void bootstrap().catch(async (error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`Outbox worker failed to start: ${message}`);
  await shutdownTelemetry();
  process.exitCode = 1;
});
