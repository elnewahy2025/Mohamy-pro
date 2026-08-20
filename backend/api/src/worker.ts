import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('OutboxWorkerBootstrap');
  const application = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  application.enableShutdownHooks();
  logger.log('Outbox worker process started');
}

void bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`Outbox worker failed to start: ${message}`);
  process.exitCode = 1;
});
