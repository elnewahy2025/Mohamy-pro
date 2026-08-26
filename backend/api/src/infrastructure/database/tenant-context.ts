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

export interface InvitationAcceptanceContext {
  tenantId: string | null;
  userId: string;
  membershipId: string | null;
  inviterMembershipId: string | null;
  invitationTokenHash: string;
  invalidatedTokenHash: string;
  operationId: string;
  globalOperation?: boolean;
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

export function assertInvitationAcceptanceContext(
  context: InvitationAcceptanceContext,
): InvitationAcceptanceContext {
  if (context.tenantId !== null) {
    assertUuidContextField(context.tenantId, 'tenantId');
  }
  assertUuidContextField(context.userId, 'userId');
  if (context.membershipId !== null) {
    assertUuidContextField(context.membershipId, 'membershipId');
  }
  if (context.inviterMembershipId !== null) {
    assertUuidContextField(context.inviterMembershipId, 'inviterMembershipId');
  }
  assertUuidContextField(context.operationId, 'operationId');
  if (!/^[0-9a-f]{64}$/i.test(context.invitationTokenHash)) {
    throw new BadRequestException(
      'Invalid database context field: invitationTokenHash',
    );
  }
  if (!/^[0-9a-f]{64}$/i.test(context.invalidatedTokenHash)) {
    throw new BadRequestException(
      'Invalid database context field: invalidatedTokenHash',
    );
  }
  return context;
}

export function assertUuidContextField(value: string, fieldName: string): void {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new BadRequestException(
      `Invalid database context field: ${fieldName}`,
    );
  }
}
