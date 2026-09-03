import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { type PartyRole } from '@prisma/client';
import { PartyOperations } from './party.operations';

@Injectable()
export class PartyRoleService {
  constructor(private readonly ops: PartyOperations) {}

  async list(request: Request): Promise<PartyRole[]> {
    const ctx = await this.ops.authorize(request);
    return this.ops.read(request, ctx, async (tx) => {
      return tx.partyRole.findMany({
        where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
        orderBy: { label: 'asc' },
      });
    });
  }
}
