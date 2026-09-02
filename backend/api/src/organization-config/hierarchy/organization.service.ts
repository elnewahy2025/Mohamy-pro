import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../../audit/audit-constants';
import { OrganizationConfigDeniedError } from '../organization-config.errors';
import {
  HierarchyOperations,
  type HierarchyContext,
} from './hierarchy.operations';

export interface CreateOrganizationInput {
  slug: string;
  name: string;
}

export interface UpdateOrganizationInput {
  id: string;
  slug?: string;
  name?: string;
}

export interface OrganizationResult {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

const TARGET = 'Organization';

/**
 * Tenant-scoped Organization ownership record. Creation, mutation and archive
 * are guarded by the CanManageOrganizationConfig policy and emit an audit
 * event atomically with the change (see HierarchyOperations).
 */
@Injectable()
export class OrganizationService {
  constructor(private readonly ops: HierarchyOperations) {}

  async create(
    request: Request,
    input: CreateOrganizationInput,
  ): Promise<OrganizationResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<OrganizationResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.ORGANIZATION_CREATED,
      TARGET,
      (transaction) =>
        transaction.organization.create({
          data: { tenantId: ctx.tenantId, slug: input.slug, name: input.name },
          select: {
            id: true,
            tenantId: true,
            slug: true,
            name: true,
            status: true,
          },
        }),
      { slug: input.slug },
    );
  }

  async update(
    request: Request,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<OrganizationResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.ORGANIZATION_UPDATED,
      TARGET,
      async (transaction) => {
        const current = await this.requireOrg(transaction, ctx, input.id);
        return transaction.organization.update({
          where: { id: current.id },
          data: {
            slug: input.slug ?? current.slug,
            name: input.name ?? current.name,
          },
          select: {
            id: true,
            tenantId: true,
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
  ): Promise<OrganizationResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<OrganizationResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.ORGANIZATION_ARCHIVED,
      TARGET,
      async (transaction) => {
        const current = await this.requireOrg(transaction, ctx, id);
        return transaction.organization.update({
          where: { id: current.id },
          data: { status: 'ARCHIVED' },
          select: {
            id: true,
            tenantId: true,
            slug: true,
            name: true,
            status: true,
          },
        });
      },
      reason ? { reason } : undefined,
    );
  }

  private async requireOrg(
    transaction: Prisma.TransactionClient,
    ctx: HierarchyContext,
    id: string,
  ): Promise<{
    id: string;
    slug: string;
    name: string;
    status: 'ACTIVE' | 'ARCHIVED';
  }> {
    const current = await transaction.organization.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, slug: true, name: true, status: true },
    });
    if (!current) throw new OrganizationConfigDeniedError('NO_ORGANIZATION');
    return current;
  }
}
