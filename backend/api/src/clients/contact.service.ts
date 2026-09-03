import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { ClientAccessDeniedError } from './clients.errors';
import { ClientOperations, type ClientContext } from './client.operations';

export interface CreateClientContactInput {
  clientId: string;
  type: 'PHONE' | 'EMAIL' | 'FAX' | 'WEBSITE' | 'MOBILE';
  value: string;
  label?: string | null;
  isPrimary?: boolean;
}

export interface UpdateClientContactInput {
  id: string;
  value?: string;
  label?: string | null;
  isPrimary?: boolean;
}

export interface ClientContactResult {
  id: string;
  tenantId: string;
  clientId: string;
  type: 'PHONE' | 'EMAIL' | 'FAX' | 'WEBSITE' | 'MOBILE';
  value: string;
  label: string | null;
  isPrimary: boolean;
}

const TARGET = 'ClientContact';

const SELECT = {
  id: true,
  tenantId: true,
  clientId: true,
  type: true,
  value: true,
  label: true,
  isPrimary: true,
} as const;

/**
 * Contact channels of a Client. Guarded by CanManageClients; always scoped to
 * the same tenant as the parent Client (verified via requireClientInTenant).
 * `isPrimary` per type is enforced: setting one as primary clears other
 * primaries of that type for the same client.
 */
@Injectable()
export class ClientContactService {
  constructor(private readonly ops: ClientOperations) {}

  async create(
    request: Request,
    input: CreateClientContactInput,
  ): Promise<ClientContactResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<ClientContactResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CLIENT_CONTACT_CREATED,
      TARGET,
      async (transaction) => {
        await this.ops.requireClientInTenant(transaction, ctx, input.clientId);
        if (input.isPrimary) {
          await this.clearPrimary(transaction, ctx, input.clientId, input.type);
        }
        return transaction.clientContact.create({
          data: {
            tenantId: ctx.tenantId,
            clientId: input.clientId,
            type: input.type,
            value: input.value,
            label: input.label ?? null,
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
    input: UpdateClientContactInput,
  ): Promise<ClientContactResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<ClientContactResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CLIENT_CONTACT_UPDATED,
      TARGET,
      async (transaction) => {
        const current = await this.requireContact(transaction, ctx, input.id);
        if (input.isPrimary) {
          await this.clearPrimary(
            transaction,
            ctx,
            current.clientId,
            current.type,
          );
        }
        return transaction.clientContact.update({
          where: { id: current.id },
          data: {
            value: input.value ?? current.value,
            label: input.label === undefined ? current.label : input.label,
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
      AUDIT_EVENT_TYPES.CLIENT_CONTACT_REMOVED,
      TARGET,
      async (transaction) => {
        const current = await this.requireContact(transaction, ctx, id);
        await transaction.clientContact.delete({ where: { id: current.id } });
        return { id };
      },
      reason ? { reason } : undefined,
    );
  }

  private async clearPrimary(
    transaction: Prisma.TransactionClient,
    ctx: ClientContext,
    clientId: string,
    type: 'PHONE' | 'EMAIL' | 'FAX' | 'WEBSITE' | 'MOBILE',
  ): Promise<void> {
    await transaction.clientContact.updateMany({
      where: { clientId, tenantId: ctx.tenantId, type, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  private async requireContact(
    transaction: Prisma.TransactionClient,
    ctx: ClientContext,
    id: string,
  ): Promise<ClientContactResult> {
    const found = await transaction.clientContact.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: SELECT,
    });
    if (!found) throw new ClientAccessDeniedError('NO_CONTACT');
    return found as ClientContactResult;
  }
}
