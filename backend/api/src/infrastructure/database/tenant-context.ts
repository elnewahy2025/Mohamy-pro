import { BadRequestException } from '@nestjs/common';

export interface TenantTransactionContext {
  tenantId: string;
  userId: string;
  membershipId: string;
  operationId: string;
}

export interface MembershipSelectionContext {
  userId: string;
  operationId: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertTenantTransactionContext(
  context: TenantTransactionContext,
): TenantTransactionContext {
  assertUuidContextField(context.tenantId, 'tenantId');
  assertUuidContextField(context.userId, 'userId');
  assertUuidContextField(context.membershipId, 'membershipId');
  assertUuidContextField(context.operationId, 'operationId');
  return context;
}

export function assertMembershipSelectionContext(
  context: MembershipSelectionContext,
): MembershipSelectionContext {
  assertUuidContextField(context.userId, 'userId');
  assertUuidContextField(context.operationId, 'operationId');
  return context;
}

export function assertUuidContextField(value: string, fieldName: string): void {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new BadRequestException(
      `Invalid database context field: ${fieldName}`,
    );
  }
}
