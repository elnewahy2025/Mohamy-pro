import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import {
  assertMembershipSelectionContext,
  assertTenantTransactionContext,
  type MembershipSelectionContext,
  type TenantTransactionContext,
} from './tenant-context';

const tenantContext: TenantTransactionContext = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  membershipId: '33333333-3333-4333-8333-333333333333',
  operationId: '44444444-4444-4444-8444-444444444444',
};

const membershipSelectionContext: MembershipSelectionContext = {
  userId: tenantContext.userId,
  operationId: tenantContext.operationId,
};

type RawQuery = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

describe('tenant database context', () => {
  it('accepts only UUID-valued tenant transaction context', () => {
    expect(assertTenantTransactionContext(tenantContext)).toBe(tenantContext);
  });

  it.each(['tenantId', 'userId', 'membershipId', 'operationId'] as const)(
    'rejects a missing or malformed %s value',
    (fieldName) => {
      const malformed: TenantTransactionContext = {
        ...tenantContext,
        [fieldName]: '',
      };

      expect(() => assertTenantTransactionContext(malformed)).toThrow(
        BadRequestException,
      );
    },
  );

  it('rejects non-UUID values instead of sending them to PostgreSQL', () => {
    expect(() =>
      assertTenantTransactionContext({
        ...tenantContext,
        tenantId: 'tenant-a',
      }),
    ).toThrow(BadRequestException);
  });

  it('validates the reduced pre-membership-selection context separately', () => {
    expect(assertMembershipSelectionContext(membershipSelectionContext)).toBe(
      membershipSelectionContext,
    );
    expect(() =>
      assertMembershipSelectionContext({
        userId: membershipSelectionContext.userId,
        operationId: 'not-a-uuid',
      }),
    ).toThrow(BadRequestException);
  });

  it('clears tenant scope during pre-membership selection', async () => {
    const queryRaw = jest.fn<ReturnType<RawQuery>, Parameters<RawQuery>>();
    queryRaw.mockResolvedValue([]);
    const transaction = {
      $queryRaw: queryRaw,
    } as unknown as Prisma.TransactionClient;
    const transactionRunner = jest.fn(
      (callback: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        callback(transaction),
    );
    const prisma = Object.create(PrismaService.prototype) as PrismaService;
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: transactionRunner,
    });

    await prisma.withMembershipSelectionContext(
      membershipSelectionContext,
      () => Promise.resolve('selection-result'),
    );

    const callArguments: unknown[] = queryRaw.mock.calls[0] ?? [];
    const template = callArguments[0] as readonly string[];
    expect(template.join('')).toContain(
      "set_config('app.tenant_id', '', true)",
    );
    expect(template.join('')).toContain(
      "set_config('app.membership_id', '', true)",
    );
    expect(callArguments.slice(1)).toEqual([
      membershipSelectionContext.userId,
      membershipSelectionContext.operationId,
    ]);
  });

  it('sets all context values through parameter bindings inside the transaction callback', async () => {
    const queryRaw = jest.fn<ReturnType<RawQuery>, Parameters<RawQuery>>();
    queryRaw.mockResolvedValue([]);
    const transaction = {
      $queryRaw: queryRaw,
    } as unknown as Prisma.TransactionClient;
    const transactionRunner = jest.fn(
      (callback: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        callback(transaction),
    );
    const prisma = Object.create(PrismaService.prototype) as PrismaService;
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: transactionRunner,
    });

    const result = await prisma.withTenantContext(tenantContext, () =>
      Promise.resolve('callback-result'),
    );

    expect(result).toBe('callback-result');
    expect(transactionRunner).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const callArguments: unknown[] = queryRaw.mock.calls[0] ?? [];
    expect(callArguments.slice(1)).toEqual([
      tenantContext.tenantId,
      tenantContext.userId,
      tenantContext.membershipId,
      tenantContext.operationId,
    ]);
  });

  it('propagates callback failures so Prisma can roll back the transaction', async () => {
    const queryRaw = jest.fn<ReturnType<RawQuery>, Parameters<RawQuery>>();
    queryRaw.mockResolvedValue([]);
    const transaction = {
      $queryRaw: queryRaw,
    } as unknown as Prisma.TransactionClient;
    const transactionRunner = jest.fn(
      (callback: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        callback(transaction),
    );
    const prisma = Object.create(PrismaService.prototype) as PrismaService;
    Object.defineProperty(prisma, '$transaction', {
      configurable: true,
      value: transactionRunner,
    });
    const failure = new Error('mutation failed');

    await expect(
      prisma.withTenantContext(tenantContext, () => Promise.reject(failure)),
    ).rejects.toBe(failure);
    expect(transactionRunner).toHaveBeenCalledTimes(1);
  });
});
