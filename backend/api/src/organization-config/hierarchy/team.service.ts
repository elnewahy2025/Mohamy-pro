import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../../audit/audit-constants';
import { OrganizationConfigDeniedError } from '../organization-config.errors';
import {
  HierarchyOperations,
  type HierarchyContext,
} from './hierarchy.operations';

export interface CreateTeamInput {
  slug: string;
  name: string;
  description?: string;
}

export interface UpdateTeamInput {
  id: string;
  slug?: string;
  name?: string;
  description?: string | null;
}

export interface TeamResult {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
}

const TARGET = 'Team';

/**
 * Tenant-scoped Team assignment construct (not an alternate security
 * boundary). Guarded by the CanManageOrganizationConfig policy and emits an
 * audit event atomically with the change (see HierarchyOperations).
 */
@Injectable()
export class TeamService {
  constructor(private readonly ops: HierarchyOperations) {}

  async create(request: Request, input: CreateTeamInput): Promise<TeamResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<TeamResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.TEAM_CREATED,
      TARGET,
      (transaction) =>
        transaction.team.create({
          data: {
            tenantId: ctx.tenantId,
            slug: input.slug,
            name: input.name,
            description: input.description ?? null,
          },
          select: {
            id: true,
            tenantId: true,
            slug: true,
            name: true,
            description: true,
            status: true,
          },
        }),
      { slug: input.slug },
    );
  }

  async update(request: Request, input: UpdateTeamInput): Promise<TeamResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<TeamResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.TEAM_UPDATED,
      TARGET,
      async (transaction) => {
        const current = await this.requireTeam(transaction, ctx, input.id);
        return transaction.team.update({
          where: { id: current.id },
          data: {
            slug: input.slug ?? current.slug,
            name: input.name ?? current.name,
            description:
              input.description === undefined
                ? current.description
                : input.description,
          },
          select: {
            id: true,
            tenantId: true,
            slug: true,
            name: true,
            description: true,
            status: true,
          },
        });
      },
    );
  }

  async archive(
    request: Request,
    id: string,
    reason?: string,
  ): Promise<TeamResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<TeamResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.TEAM_ARCHIVED,
      TARGET,
      async (transaction) => {
        const current = await this.requireTeam(transaction, ctx, id);
        return transaction.team.update({
          where: { id: current.id },
          data: { status: 'ARCHIVED' },
          select: {
            id: true,
            tenantId: true,
            slug: true,
            name: true,
            description: true,
            status: true,
          },
        });
      },
      reason ? { reason } : undefined,
    );
  }

  private async requireTeam(
    transaction: Prisma.TransactionClient,
    ctx: HierarchyContext,
    id: string,
  ): Promise<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
  }> {
    const current = await transaction.team.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        status: true,
      },
    });
    if (!current) throw new OrganizationConfigDeniedError('NO_TEAM');
    return current;
  }
}
