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
