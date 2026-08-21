import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../config/env.validation';
import { isMetricsAuthorized } from './metrics-access';
import { MetricsService } from './metrics.service';

export class WorkerMetricsServer {
  private server?: Server;

  constructor(
    private readonly config: ConfigService<ValidatedEnvironment, true>,
    private readonly metrics: MetricsService,
  ) {}

  async start(): Promise<void> {
    if (!this.metrics.enabled) return;
    const port = this.config.getOrThrow<number>('WORKER_METRICS_PORT');
    const host =
      this.config.get<string>('NODE_ENV') === 'production'
        ? '0.0.0.0'
        : '127.0.0.1';
    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      const server = this.server;
      if (!server) {
        reject(new Error('Worker metrics server was not created'));
        return;
      }
      const onError = (error: Error) => {
        server.removeListener('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.url?.split('?')[0] !== '/metrics') {
      response.statusCode = 404;
      response.end('Not Found');
      return;
    }
    if (!isMetricsAuthorized(this.config, request)) {
      response.statusCode = 403;
      response.end('Forbidden');
      return;
    }
    response.statusCode = 200;
    response.setHeader('Content-Type', this.metrics.registry.contentType);
    response.end(await this.metrics.render());
  }
}
