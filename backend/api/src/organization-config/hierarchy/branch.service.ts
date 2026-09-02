import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../../audit/audit-constants';
import { OrganizationConfigDeniedError } from '../organization-config.errors';
import {
  HierarchyOperations,
  type HierarchyContext,
} from './hierarchy.operations';

export interface CreateBranchInput {
  organizationId: string;
  slug: string;
  name: string;
}

export interface UpdateBranchInput {
  id: string;
  slug?: string;
  name?: string;
}

export interface BranchResult {
  id: string;
  tenantId: string;
  organizationId: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

const TARGET = 'Branch';

/**
 * Tenant-scoped Branch hierarchy node beneath an Organization. Guarded by the
 * CanManageOrganizationConfig policy and emits an audit event atomically with
 * the change (see HierarchyOperations).
 */
@Injectable()
export class BranchService {
  constructor(private readonly ops: HierarchyOperations) {}

  async create(
    request: Request,
    input: CreateBranchInput,
  ): Promise<BranchResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<BranchResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.BRANCH_CREATED,
      TARGET,
      async (transaction) => {
        const org = await transaction.organization.findFirst({
          where: { id: input.organizationId, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!org) throw new OrganizationConfigDeniedError('NO_ORGANIZATION');
        return transaction.branch.create({
          data: {
            tenantId: ctx.tenantId,
            organizationId: input.organizationId,
            slug: input.slug,
            name: input.name,
          },
          select: {
            id: true,
            tenantId: true,
            organizationId: true,
            slug: true,
            name: true,
            status: true,
          },
        });
      },
      { slug: input.slug },
    );
  }

  async update(
    request: Request,
    input: UpdateBranchInput,
  ): Promise<BranchResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<BranchResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.BRANCH_UPDATED,
      TARGET,
      async (transaction) => {
        const current = await this.requireBranch(transaction, ctx, input.id);
        return transaction.branch.update({
          where: { id: current.id },
          data: {
            slug: input.slug ?? current.slug,
            name: input.name ?? current.name,
          },
          select: {
            id: true,
            tenantId: true,
            organizationId: true,
            slug: true,
            name: true,
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
  ): Promise<BranchResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<BranchResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.BRANCH_ARCHIVED,
      TARGET,
      async (transaction) => {
        const current = await this.requireBranch(transaction, ctx, id);
        return transaction.branch.update({
          where: { id: current.id },
          data: { status: 'ARCHIVED' },
          select: {
            id: true,
            tenantId: true,
            organizationId: true,
            slug: true,
            name: true,
            status: true,
          },
        });
      },
      reason ? { reason } : undefined,
    );
  }

  private async requireBranch(
    transaction: Prisma.TransactionClient,
    ctx: HierarchyContext,
    id: string,
  ): Promise<{
    id: string;
    slug: string;
    name: string;
    status: 'ACTIVE' | 'ARCHIVED';
  }> {
    const current = await transaction.branch.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, slug: true, name: true, status: true },
    });
    if (!current) throw new OrganizationConfigDeniedError('NO_BRANCH');
    return current;
  }
}
