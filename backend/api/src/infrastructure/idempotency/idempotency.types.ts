export type IdempotencyActorScope = string | null;
export type IdempotencyTenantScope = string | null;

export interface IdempotencyScope {
  actorScope: IdempotencyActorScope;
  tenantScope: IdempotencyTenantScope;
  method: string;
  route: string;
}

export interface ReserveIdempotencyInput extends IdempotencyScope {
  key: string;
  fingerprint: string;
  expiresAt: Date;
  requestId?: string;
}

export interface CompleteIdempotencyInput {
  id: string;
  fingerprint: string;
  responseStatus: number;
  responseBody: string;
  responseHeaders?: Record<string, string>;
  tenantId?: string | null;
  actorScope?: string | null;
}

export type IdempotencyReservationOutcome =
  'reserved' | 'replay' | 'conflict' | 'in_progress';
