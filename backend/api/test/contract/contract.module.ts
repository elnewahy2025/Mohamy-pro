import { Module } from '@nestjs/common';
import { ApplicationConfigModule } from '../../src/config/config.module';
import { CorrelationIdMiddleware } from '../../src/common/middleware/correlation-id.middleware';
import { MetricsService } from '../../src/observability/metrics.service';
import { IdempotencyService } from '../../src/infrastructure/idempotency/idempotency.service';
import { ContractController } from './contract.controller';
import { InMemoryIdempotencyService } from './in-memory-idempotency.service';

/**
 * Focused test module that wires only the HTTP response/error contract
 * machinery through the real `Main`-style global interceptors, filter and
 * validation pipe. It intentionally avoids importing `AppModule`, which pulls
 * in the ESM `openid-client` dependency and would fail under the CJS jest e2e
 * runtime. Rank-limiter/observability middleware are omitted here because they
 * are covered by dedicated unit specs and would make the contract assertions
 * stateful; the envelope/error/idempotency/validation contract does not depend
 * on them.
 */
@Module({
  imports: [ApplicationConfigModule],
  controllers: [ContractController],
  providers: [
    MetricsService,
    CorrelationIdMiddleware,
    { provide: IdempotencyService, useClass: InMemoryIdempotencyService },
  ],
  exports: [MetricsService, CorrelationIdMiddleware, IdempotencyService],
})
export class ContractTestModule {}
