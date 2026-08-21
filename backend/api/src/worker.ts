import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
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
  logger.log('Outbox worker process started');

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
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
