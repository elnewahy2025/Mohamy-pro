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
  assertUuidContextField,
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
  ): Promise<TResult> {
    const validatedContext = assertTenantTransactionContext(context);
    return this.$transaction(async (transaction) => {
      await setTransactionContext(transaction, validatedContext);
      return callback(transaction);
    });
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

  async bindTenantContext(
    transaction: Prisma.TransactionClient,
    context: TenantTransactionContext,
  ): Promise<void> {
    const validatedContext = assertTenantTransactionContext(context);
    await setTransactionContext(transaction, validatedContext);
  }

  async bindMembershipSelectionContext(
    transaction: Prisma.TransactionClient,
    context: MembershipSelectionContext,
  ): Promise<void> {
    const validatedContext = assertMembershipSelectionContext(context);
    await setMembershipSelectionContext(transaction, validatedContext);
  }

  async bindGlobalOperationContext(
    transaction: Prisma.TransactionClient,
    operationId: string,
  ): Promise<void> {
    assertUuidContextField(operationId, 'operationId');
    await setControlContext(transaction, {
      operationId,
      globalOperation: true,
    });
  }

  async withAuditRetentionContext<TResult>(
    operationId: string,
    callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    assertUuidContextField(operationId, 'operationId');
    return this.$transaction(async (transaction) => {
      await setControlContext(transaction, {
        operationId,
        globalOperation: true,
        auditRetentionPurge: true,
      });
      return callback(transaction);
    });
  }

  async withGlobalOperationContext<TResult>(
    operationId: string,
    callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    assertUuidContextField(operationId, 'operationId');
    return this.$transaction(async (transaction) => {
      await setControlContext(transaction, {
        operationId,
        globalOperation: true,
      });
      return callback(transaction);
    });
  }

  async withOutboxDispatcherContext<TResult>(
    operationId: string,
    callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    assertUuidContextField(operationId, 'operationId');
    return this.$transaction(async (transaction) => {
      await setControlContext(transaction, {
        operationId,
        outboxDispatcher: true,
      });
      return callback(transaction);
    });
  }

  async withIdempotencyMaintenanceContext<TResult>(
    operationId: string,
    callback: (transaction: Prisma.TransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    assertUuidContextField(operationId, 'operationId');
    return this.$transaction(async (transaction) => {
      await setControlContext(transaction, {
        operationId,
        idempotencyMaintenance: true,
      });
      return callback(transaction);
    });
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
      set_config('app.operation_id', ${context.operationId}, true),
      set_config('app.global_operation', 'false', true),
      set_config('app.outbox_dispatcher', 'false', true),
      set_config('app.idempotency_maintenance', 'false', true),
      set_config('app.audit_retention_purge', 'false', true)
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
      set_config('app.operation_id', ${context.operationId}, true),
      set_config('app.global_operation', 'false', true),
      set_config('app.outbox_dispatcher', 'false', true),
      set_config('app.idempotency_maintenance', 'false', true),
      set_config('app.audit_retention_purge', 'false', true)
  `;
}

interface ControlContext {
  operationId: string;
  globalOperation?: boolean;
  outboxDispatcher?: boolean;
  idempotencyMaintenance?: boolean;
  auditRetentionPurge?: boolean;
}

async function setControlContext(
  transaction: Prisma.TransactionClient,
  context: ControlContext,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT
      set_config('app.tenant_id', '', true),
      set_config('app.user_id', '', true),
      set_config('app.membership_id', '', true),
      set_config('app.operation_id', ${context.operationId}, true),
      set_config('app.global_operation', ${String(context.globalOperation ?? false)}, true),
      set_config('app.outbox_dispatcher', ${String(context.outboxDispatcher ?? false)}, true),
      set_config('app.idempotency_maintenance', ${String(context.idempotencyMaintenance ?? false)}, true),
      set_config('app.audit_retention_purge', ${String(context.auditRetentionPurge ?? false)}, true)
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
