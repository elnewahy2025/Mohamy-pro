import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@prisma/client';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../../config/env.validation';
import { MetricsService } from '../../observability/metrics.service';
import {
  assertMembershipSelectionContext,
  assertTenantTransactionContext,
  type MembershipSelectionContext,
  type TenantTransactionContext,
} from './tenant-context';

interface PrismaQueryEvent {
  duration: number;
  query: string;
}

interface PrismaQueryEventEmitter {
  $on(eventType: 'query', callback: (event: PrismaQueryEvent) => void): void;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly metrics: MetricsService;

  constructor(
    config: ConfigService<ValidatedEnvironment, true>,
    metrics: MetricsService,
  ) {
    const adapter = new PrismaPg(config.getOrThrow('DATABASE_URL'), {
      schema: 'public',
      onPoolError: (error) => {
        loggerForPoolError(error);
        metrics.recordDatabaseError('database');
      },
    });
    super({
      adapter,
      log: [{ emit: 'event', level: 'query' }],
    });
    this.metrics = metrics;
    const queryEvents = this as unknown as PrismaQueryEventEmitter;
    queryEvents.$on('query', (event) => {
      this.metrics.recordDatabaseQuery(
        event.duration,
        databaseOperation(event.query),
      );
    });
  }

  async withTenantContext<TResult>(
    context: TenantTransactionContext,
    callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<TResult> {
    const validatedContext = assertTenantTransactionContext(context);
    return this.$transaction(async (transaction) => {
      await setTransactionContext(transaction, validatedContext);
      return callback(transaction);
    }, options);
  }

  async withMembershipSelectionContext<TResult>(
    context: MembershipSelectionContext,
    callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    const validatedContext = assertMembershipSelectionContext(context);
    return this.$transaction(async (transaction) => {
      await setMembershipSelectionContext(transaction, validatedContext);
      return callback(transaction);
    });
  }

  /**
   * Global delivery scope for the outbox claim/dispatch path. This is an
   * explicit, bounded operational scope that allows the dispatcher to read and
   * advance any OutboxMessage row (tenant or global) without requiring per-row
   * tenant context. Per-job processing later re-scopes to the job's tenant.
   */
  async withDeliveryScope<TResult>(
    callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    return this.$transaction(async (transaction) => {
      await setDeliveryScope(transaction);
      return callback(transaction);
    });
  }

  /**
   * Worker tenant context: the worker validates the job's tenant scope from
   * the payload, opens a transaction, sets the context (tenant + operation), and
   * processes the job through an idempotent handler. No membership is required
   * for the worker boundary.
   */
  async withWorkerTenantContext<TResult>(
    tenantId: string,
    operationId: string,
    callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    return this.$transaction(async (transaction) => {
      await setWorkerTenantContext(transaction, tenantId, operationId);
      return callback(transaction);
    });
  }

  /**
   * Actor scope: an authenticated actor with no active tenant/membership (e.g.
   * tenant-switch pre-selection). Establishes user + operation but no tenant,
   * so actor-only rows (tenantId IS NULL) are reachable without exposing them
   * to any tenant context.
   */
  async withActorScopeContext<TResult>(
    userId: string,
    operationId: string,
    callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    return this.withMembershipSelectionContext(
      { userId, operationId },
      callback,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('PostgreSQL connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

async function setTransactionContext(
  transaction: Prisma.TransactionClient,
  context: TenantTransactionContext,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT
      set_config('app.tenant_id', ${context.tenantId}, true),
      set_config('app.user_id', ${context.userId}, true),
      set_config('app.membership_id', ${context.membershipId}, true),
      set_config('app.operation_id', ${context.operationId}, true)
  `;
}

async function setMembershipSelectionContext(
  transaction: Prisma.TransactionClient,
  context: MembershipSelectionContext,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT
      set_config('app.tenant_id', '', true),
      set_config('app.user_id', ${context.userId}, true),
      set_config('app.membership_id', '', true),
      set_config('app.operation_id', ${context.operationId}, true)
  `;
}

async function setDeliveryScope(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  const operationId = crypto.randomUUID();
  await transaction.$queryRaw`
    SELECT
      set_config('app.delivery_scope', 'true', true),
      set_config('app.tenant_id', '', true),
      set_config('app.user_id', '', true),
      set_config('app.membership_id', '', true),
      set_config('app.operation_id', ${operationId}, true)
  `;
}

async function setWorkerTenantContext(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  operationId: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT
      set_config('app.tenant_id', ${tenantId}, true),
      set_config('app.user_id', '', true),
      set_config('app.membership_id', '', true),
      set_config('app.operation_id', ${operationId}, true)
  `;
}

function databaseOperation(query: string): string {
  return query.trim().split(/\s+/, 1)[0] ?? 'other';
}

function loggerForPoolError(error: Error): void {
  console.error(
    JSON.stringify({
      event: 'postgres_pool_error',
      errorName: error.name,
      message: error.message,
      timestamp: new Date().toISOString(),
    }),
  );
}
