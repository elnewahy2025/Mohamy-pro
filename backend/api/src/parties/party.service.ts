import { Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { type Party, Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import type { Paginated } from '../common/api/envelope';
import { PartyOperations } from './party.operations';
import type { CreatePartyDto } from './dto/create-party.dto';
import type { UpdatePartyDto } from './dto/update-party.dto';
import type { PartyQueryDto } from './dto/party-query.dto';

@Injectable()
export class PartyService {
  constructor(private readonly ops: PartyOperations) {}

  async create(request: Request, dto: CreatePartyDto): Promise<Party> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.PARTY_CREATED,
      'Party',
      async (tx) => {
        if (dto.clientId) {
          // ensure client exists in tenant
          const client = await tx.client.findFirst({
            where: { id: dto.clientId, tenantId: ctx.tenantId },
          });
          if (!client) {
            throw new NotFoundException('Client not found in tenant');
          }
        }
        return tx.party.create({
          data: {
            tenantId: ctx.tenantId,
            partyType: dto.partyType,
            name: dto.name,
            legalName: dto.legalName,
            displayName: dto.displayName,
            clientId: dto.clientId,
            notes: dto.notes,
          },
        });
      },
      { partyType: dto.partyType, hasClientId: !!dto.clientId },
    );
  }

  async get(request: Request, id: string): Promise<Party> {
    const ctx = await this.ops.authorize(request);
    return this.ops.read(request, ctx, async (tx) => {
      const party = await tx.party.findFirst({
        where: { id, tenantId: ctx.tenantId },
      });
      if (!party) throw new NotFoundException('Party not found');
      return party;
    });
  }

  async update(
    request: Request,
    id: string,
    dto: UpdatePartyDto,
  ): Promise<Party> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.PARTY_UPDATED,
      'Party',
      async (tx) => {
        await this.ops.requirePartyInTenant(tx, ctx, id);
        return tx.party.update({
          where: { id_tenantId: { id, tenantId: ctx.tenantId } },
          data: dto,
        });
      },
    );
  }

  async archive(request: Request, id: string, reason: string): Promise<Party> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.PARTY_ARCHIVED,
      'Party',
      async (tx) => {
        await this.ops.requirePartyInTenant(tx, ctx, id);
        return tx.party.update({
          where: { id_tenantId: { id, tenantId: ctx.tenantId } },
          data: { status: 'ARCHIVED' },
        });
      },
      { reason },
    );
  }

  async list(
    request: Request,
    query: PartyQueryDto,
  ): Promise<Paginated<Party>> {
    const ctx = await this.ops.authorize(request);
    return this.ops.read(request, ctx, async (tx) => {
      const where: Prisma.PartyWhereInput = { tenantId: ctx.tenantId };
      if (query.status) {
        where.status = query.status;
      } else {
        where.status = 'ACTIVE';
      }
      if (query.partyType) where.partyType = query.partyType;
      if (query.search) {
        where.displayName = { contains: query.search, mode: 'insensitive' };
      }

      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      const [items, total] = await Promise.all([
        tx.party.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        tx.party.count({ where }),
      ]);
      return { data: items, pagination: { total, page, limit } };
    });
  }
}
