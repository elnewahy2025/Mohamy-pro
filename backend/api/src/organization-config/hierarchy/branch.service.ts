import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../../audit/audit-constants';
import { OrganizationConfigDeniedError } from '../organization-config.errors';
import {
  HierarchyOperations,
  type HierarchyContext,
} from './hierarchy.operations';

export interface BranchProfileInput {
  contactPhone?: string;
  contactEmail?: string;
  addressLine1?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  mapUrl?: string;
  operatingCurrency?: string;
  workingHours?: string;
  managerName?: string;
  isHeadOffice?: boolean;
}

export interface UpdateBranchInput extends BranchProfileInput {
  id: string;
  slug?: string;
  name?: string;
}

export interface CreateBranchInput extends BranchProfileInput {
  organizationId: string;
  slug: string;
  name: string;
}

export interface BranchResult {
  id: string;
  tenantId: string;
  organizationId: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
  contactPhone: string | null;
  contactEmail: string | null;
  addressLine1: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  mapUrl: string | null;
  operatingCurrency: string;
  workingHours: string | null;
  managerName: string | null;
  isHeadOffice: boolean;
}

const BRANCH_SELECT = {
  id: true,
  tenantId: true,
  organizationId: true,
  slug: true,
  name: true,
  status: true,
  contactPhone: true,
  contactEmail: true,
  addressLine1: true,
  city: true,
  country: true,
  postalCode: true,
  mapUrl: true,
  operatingCurrency: true,
  workingHours: true,
  managerName: true,
  isHeadOffice: true,
} as const;

function branchProfileData(input: BranchProfileInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of [
    'contactPhone',
    'contactEmail',
    'addressLine1',
    'city',
    'country',
    'postalCode',
    'mapUrl',
    'operatingCurrency',
    'workingHours',
    'managerName',
    'isHeadOffice',
  ] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  return data;
}

async function clearOtherHeadOffices(
  transaction: { branch: { updateMany: (args: unknown) => Promise<unknown> } },
  tenantId: string,
  exceptId: string,
): Promise<void> {
  await transaction.branch.updateMany({
    where: { tenantId, id: { not: exceptId }, isHeadOffice: true },
    data: { isHeadOffice: false },
  });
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
        const created = await transaction.branch.create({
          data: {
            tenantId: ctx.tenantId,
            organizationId: input.organizationId,
            slug: input.slug,
            name: input.name,
            ...branchProfileData(input),
          },
          select: BRANCH_SELECT,
        });
        if (created.isHeadOffice) {
          await clearOtherHeadOffices(transaction, ctx.tenantId, created.id);
        }
        return created;
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
        const updated = await transaction.branch.update({
          where: { id: current.id },
          data: {
            slug: input.slug ?? current.slug,
            name: input.name ?? current.name,
            ...branchProfileData(input),
          },
          select: BRANCH_SELECT,
        });
        if (updated.isHeadOffice) {
          await clearOtherHeadOffices(transaction, ctx.tenantId, updated.id);
        }
        return updated;
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
          select: BRANCH_SELECT,
        });
      },
      reason ? { reason } : undefined,
    );
  }

  async list(request: Request): Promise<BranchResult[]> {
    const ctx = await this.ops.authorize(request);
    return this.ops.read(request, ctx, (transaction) =>
      transaction.branch.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { name: 'asc' },
        take: 100,
        select: BRANCH_SELECT,
      }),
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
