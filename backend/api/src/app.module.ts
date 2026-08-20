import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ApplicationConfigModule } from './config/config.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApplicationLoggerModule } from './observability/logger.module';

@Module({
  imports: [ApplicationConfigModule, ApplicationLoggerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
