import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsMiddleware } from './metrics.middleware';
import { MetricsService } from './metrics.service';
import { MetricsSnapshotService } from './metrics-snapshot.service';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsMiddleware, MetricsSnapshotService],
  exports: [MetricsService, MetricsMiddleware, MetricsSnapshotService],
})
export class MetricsModule {}
