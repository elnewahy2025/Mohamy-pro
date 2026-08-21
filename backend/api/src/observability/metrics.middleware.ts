import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

type RequestWithRoute = Omit<Request, 'route'> & {
  route?: {
    path?: string | string[];
  };
};

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = performance.now();
    response.once('finish', () => {
      const requestWithRoute = request as RequestWithRoute;
      const route = requestWithRoute.route?.path;
      const routeTemplate = Array.isArray(route)
        ? route.join('|')
        : (route ?? 'unknown');
      this.metrics.recordHttpRequest(
        request.method,
        routeTemplate,
        response.statusCode,
        performance.now() - startedAt,
      );
    });
    next();
  }
}
