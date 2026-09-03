import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import type { Paginated } from '../common/api/envelope';
import { ClientAccessDeniedError } from './clients.errors';
import { ClientOperations, type ClientContext } from './client.operations';

export const CLIENT_SORT_FIELDS = ['createdAt', 'updatedAt'] as const;
export type ClientSortField = (typeof CLIENT_SORT_FIELDS)[number];

export interface CreateClientInput {
  clientType: 'INDIVIDUAL' | 'ORGANIZATION';
  name: string;
  legalName?: string | null;
  source?: string | null;
  notes?: string | null;
}

export interface UpdateClientInput {
  id: string;
  name?: string;
  legalName?: string | null;
  source?: string | null;
  notes?: string | null;
}

export interface ListClientQuery {
  page: number;
  limit: number;
  search?: string;
  status?: 'ACTIVE' | 'ARCHIVED';
  clientType?: 'INDIVIDUAL' | 'ORGANIZATION';
}

export interface ClientResult {
  id: string;
  tenantId: string;
  clientType: 'INDIVIDUAL' | 'ORGANIZATION';
  name: string;
  legalName: string | null;
  displayName: string;
  status: 'ACTIVE' | 'ARCHIVED';
  source: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const TARGET = 'Client';

const CLIENT_SELECT = {
  id: true,
  tenantId: true,
  clientType: true,
  name: true,
  legalName: true,
  displayName: true,
  status: true,
  source: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Tenant-scoped Client entity — an individual or organization counterparty.
 * Guarded by the CanManageClients policy; mutations run inside the tenant
 * context (RLS) and emit an audit event atomically (see ClientOperations).
 * Clients are soft-archived via status ACTIVE/ARCHIVED; never hard-deleted.
 */
@Injectable()
export class ClientService {
  constructor(private readonly ops: ClientOperations) {}

  async create(
    request: Request,
    input: CreateClientInput,
  ): Promise<ClientResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<ClientResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CLIENT_CREATED,
      TARGET,
      (transaction) =>
        transaction.client.create({
          data: {
            tenantId: ctx.tenantId,
            clientType: input.clientType,
            name: input.name,
            legalName: input.legalName ?? null,
            displayName: this.displayName(input),
            source: input.source ?? null,
            notes: input.notes ?? null,
          },
          select: CLIENT_SELECT,
        }),
      { clientType: input.clientType },
    );
  }

  async update(
    request: Request,
    input: UpdateClientInput,
  ): Promise<ClientResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<ClientResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CLIENT_UPDATED,
      TARGET,
      async (transaction) => {
        const current = await this.requireClient(transaction, ctx, input.id);
        const merged = {
          name: input.name ?? current.name,
          legalName:
            input.legalName === undefined ? current.legalName : input.legalName,
          clientType: current.clientType,
        };
        return transaction.client.update({
          where: { id: current.id },
          data: {
            name: merged.name,
            legalName: merged.legalName,
            displayName: this.displayName(merged),
            source: input.source === undefined ? current.source : input.source,
            notes: input.notes === undefined ? current.notes : input.notes,
          },
          select: CLIENT_SELECT,
        });
      },
    );
  }

  async archive(
    request: Request,
    id: string,
    reason?: string,
  ): Promise<ClientResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<ClientResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CLIENT_ARCHIVED,
      TARGET,
      async (transaction) => {
        const current = await this.requireClient(transaction, ctx, id);
        return transaction.client.update({
          where: { id: current.id },
          data: { status: 'ARCHIVED' },
          select: CLIENT_SELECT,
        });
      },
      reason ? { reason } : undefined,
    );
  }

  async get(request: Request, id: string): Promise<ClientResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.read<ClientResult>(request, ctx, async (transaction) => {
      const found = await this.requireClient(transaction, ctx, id);
      return found;
    });
  }

  async list(
    request: Request,
    query: ListClientQuery,
  ): Promise<Paginated<ClientResult>> {
    const ctx = await this.ops.authorize(request);
    return this.ops.read<Paginated<ClientResult>>(
      request,
      ctx,
      async (transaction) => {
        const where: Prisma.ClientWhereInput = { tenantId: ctx.tenantId };
        if (query.status) where.status = query.status;
        if (query.clientType) where.clientType = query.clientType;
        if (query.search && query.search.trim().length > 0) {
          const term = query.search.trim();
          where.OR = [
            { displayName: { contains: term, mode: 'insensitive' } },
            { name: { contains: term, mode: 'insensitive' } },
            { legalName: { contains: term, mode: 'insensitive' } },
          ];
        }
        const [total, rows] = await Promise.all([
          transaction.client.count({ where }),
          transaction.client.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (query.page - 1) * query.limit,
            take: query.limit,
            select: CLIENT_SELECT,
          }),
        ]);
        return {
          data: rows,
          pagination: { page: query.page, limit: query.limit, total },
        };
      },
    );
  }

  private displayName(input: {
    name: string;
    legalName?: string | null;
    clientType?: 'INDIVIDUAL' | 'ORGANIZATION';
  }): string {
    if (input.clientType === 'ORGANIZATION' && input.legalName) {
      return `${input.name} (${input.legalName})`;
    }
    return input.name;
  }

  private async requireClient(
    transaction: Prisma.TransactionClient,
    ctx: ClientContext,
    id: string,
  ): Promise<ClientResult> {
    const found = await transaction.client.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: CLIENT_SELECT,
    });
    if (!found) throw new ClientAccessDeniedError('NO_CLIENT');
    return found;
  }
}
