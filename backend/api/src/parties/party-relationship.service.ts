import { BadRequestException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { type PartyRelationship, Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import type { Paginated } from '../common/api/envelope';
import { PartyOperations } from './party.operations';
import type { CreatePartyRelationshipDto } from './dto/create-party-relationship.dto';
import type { PaginationDto } from '../common/api/pagination.dto';

@Injectable()
export class PartyRelationshipService {
  constructor(private readonly ops: PartyOperations) {}

  async create(
    request: Request,
    fromPartyId: string,
    dto: CreatePartyRelationshipDto,
  ): Promise<PartyRelationship> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.PARTY_RELATIONSHIP_CREATED,
      'PartyRelationship',
      async (tx) => {
        if (fromPartyId === dto.toPartyId) {
          throw new BadRequestException(
            'A party cannot have a relationship with itself',
          );
        }

        await this.ops.requirePartyInTenant(tx, ctx, fromPartyId);
        await this.ops.requirePartyInTenant(tx, ctx, dto.toPartyId);

        return tx.partyRelationship.create({
          data: {
            tenantId: ctx.tenantId,
            fromPartyId,
            toPartyId: dto.toPartyId,
            relationshipType: dto.relationshipType,
          },
        });
      },
      { relationshipType: dto.relationshipType },
    );
  }

  async list(
    request: Request,
    partyId: string,
    query: PaginationDto,
  ): Promise<Paginated<PartyRelationship>> {
    const ctx = await this.ops.authorize(request);
    return this.ops.read(request, ctx, async (tx) => {
      await this.ops.requirePartyInTenant(tx, ctx, partyId);

      const where: Prisma.PartyRelationshipWhereInput = {
        tenantId: ctx.tenantId,
        OR: [{ fromPartyId: partyId }, { toPartyId: partyId }],
        status: 'ACTIVE',
      };

      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      const [items, total] = await Promise.all([
        tx.partyRelationship.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            fromParty: {
              select: { id: true, displayName: true, partyType: true },
            },
            toParty: {
              select: { id: true, displayName: true, partyType: true },
            },
          },
        }),
        tx.partyRelationship.count({ where }),
      ]);
      return { data: items, pagination: { total, page, limit } };
    });
  }
}
