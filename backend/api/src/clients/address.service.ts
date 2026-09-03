import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { ClientAccessDeniedError } from './clients.errors';
import { ClientOperations, type ClientContext } from './client.operations';

export interface CreateClientAddressInput {
  clientId: string;
  type: 'MAILING' | 'BILLING' | 'REGISTERED' | 'BRANCH';
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postalCode?: string | null;
  country: string;
  isPrimary?: boolean;
}

export interface UpdateClientAddressInput {
  id: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  region?: string | null;
  postalCode?: string | null;
  country?: string;
  isPrimary?: boolean;
}

export interface ClientAddressResult {
  id: string;
  tenantId: string;
  clientId: string;
  type: 'MAILING' | 'BILLING' | 'REGISTERED' | 'BRANCH';
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  country: string;
  isPrimary: boolean;
}

const TARGET = 'ClientAddress';

const SELECT = {
  id: true,
  tenantId: true,
  clientId: true,
  type: true,
  line1: true,
  line2: true,
  city: true,
  region: true,
  postalCode: true,
  country: true,
  isPrimary: true,
} as const;

/**
 * Physical addresses of a Client. Guarded by CanManageClients; always scoped to
 * the same tenant as the parent Client (verified via requireClientInTenant).
 * `isPrimary` per type is enforced: setting one as primary clears other
 * primaries of that type for the same client.
 */
@Injectable()
export class ClientAddressService {
  constructor(private readonly ops: ClientOperations) {}

  async create(
    request: Request,
    input: CreateClientAddressInput,
  ): Promise<ClientAddressResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<ClientAddressResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CLIENT_ADDRESS_CREATED,
      TARGET,
      async (transaction) => {
        await this.ops.requireClientInTenant(transaction, ctx, input.clientId);
        if (input.isPrimary) {
          await this.clearPrimary(transaction, ctx, input.clientId, input.type);
        }
        return transaction.clientAddress.create({
          data: {
            tenantId: ctx.tenantId,
            clientId: input.clientId,
            type: input.type,
            line1: input.line1,
            line2: input.line2 ?? null,
            city: input.city,
            region: input.region ?? null,
            postalCode: input.postalCode ?? null,
            country: input.country,
            isPrimary: input.isPrimary ?? false,
          },
          select: SELECT,
        });
      },
      { type: input.type },
    );
  }

  async update(
    request: Request,
    input: UpdateClientAddressInput,
  ): Promise<ClientAddressResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<ClientAddressResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CLIENT_ADDRESS_UPDATED,
      TARGET,
      async (transaction) => {
        const current = await this.requireAddress(transaction, ctx, input.id);
        if (input.isPrimary) {
          await this.clearPrimary(
            transaction,
            ctx,
            current.clientId,
            current.type,
          );
        }
        return transaction.clientAddress.update({
          where: { id: current.id },
          data: {
            line1: input.line1 ?? current.line1,
            line2: input.line2 === undefined ? current.line2 : input.line2,
            city: input.city ?? current.city,
            region: input.region === undefined ? current.region : input.region,
            postalCode:
              input.postalCode === undefined
                ? current.postalCode
                : input.postalCode,
            country: input.country ?? current.country,
            isPrimary: input.isPrimary ?? current.isPrimary,
          },
          select: SELECT,
        });
      },
    );
  }

  async remove(request: Request, id: string, reason?: string): Promise<void> {
    const ctx = await this.ops.authorize(request);
    await this.ops.run<{ id: string }>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CLIENT_ADDRESS_REMOVED,
      TARGET,
      async (transaction) => {
        const current = await this.requireAddress(transaction, ctx, id);
        await transaction.clientAddress.delete({ where: { id: current.id } });
        return { id };
      },
      reason ? { reason } : undefined,
    );
  }

  private async clearPrimary(
    transaction: Prisma.TransactionClient,
    ctx: ClientContext,
    clientId: string,
    type: 'MAILING' | 'BILLING' | 'REGISTERED' | 'BRANCH',
  ): Promise<void> {
    await transaction.clientAddress.updateMany({
      where: { clientId, tenantId: ctx.tenantId, type, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  private async requireAddress(
    transaction: Prisma.TransactionClient,
    ctx: ClientContext,
    id: string,
  ): Promise<ClientAddressResult> {
    const found = await transaction.clientAddress.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: SELECT,
    });
    if (!found) throw new ClientAccessDeniedError('NO_ADDRESS');
    return found as ClientAddressResult;
  }
}
