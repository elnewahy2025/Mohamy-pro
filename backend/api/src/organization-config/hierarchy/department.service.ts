import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../../audit/audit-constants';
import { OrganizationConfigDeniedError } from '../organization-config.errors';
import {
  HierarchyOperations,
  type HierarchyContext,
} from './hierarchy.operations';

export interface CreateDepartmentInput {
  branchId: string;
  slug: string;
  name: string;
}

export interface UpdateDepartmentInput {
  id: string;
  slug?: string;
  name?: string;
}

export interface DepartmentResult {
  id: string;
  tenantId: string;
  branchId: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

const TARGET = 'Department';

/**
 * Tenant-scoped Department hierarchy node beneath a Branch. Guarded by the
 * CanManageOrganizationConfig policy and emits an audit event atomically with
 * the change (see HierarchyOperations).
 */
@Injectable()
export class DepartmentService {
  constructor(private readonly ops: HierarchyOperations) {}

  async create(
    request: Request,
    input: CreateDepartmentInput,
  ): Promise<DepartmentResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<DepartmentResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.DEPARTMENT_CREATED,
      TARGET,
      async (transaction) => {
        const branch = await transaction.branch.findFirst({
          where: { id: input.branchId, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!branch) throw new OrganizationConfigDeniedError('NO_BRANCH');
        return transaction.department.create({
          data: {
            tenantId: ctx.tenantId,
            branchId: input.branchId,
            slug: input.slug,
            name: input.name,
          },
          select: {
            id: true,
            tenantId: true,
            branchId: true,
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
    input: UpdateDepartmentInput,
  ): Promise<DepartmentResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<DepartmentResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.DEPARTMENT_UPDATED,
      TARGET,
      async (transaction) => {
        const current = await this.requireDepartment(
          transaction,
          ctx,
          input.id,
        );
        return transaction.department.update({
          where: { id: current.id },
          data: {
            slug: input.slug ?? current.slug,
            name: input.name ?? current.name,
          },
          select: {
            id: true,
            tenantId: true,
            branchId: true,
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
  ): Promise<DepartmentResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<DepartmentResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.DEPARTMENT_ARCHIVED,
      TARGET,
      async (transaction) => {
        const current = await this.requireDepartment(transaction, ctx, id);
        return transaction.department.update({
          where: { id: current.id },
          data: { status: 'ARCHIVED' },
          select: {
            id: true,
            tenantId: true,
            branchId: true,
            slug: true,
            name: true,
            status: true,
          },
        });
      },
      reason ? { reason } : undefined,
    );
  }

  private async requireDepartment(
    transaction: Prisma.TransactionClient,
    ctx: HierarchyContext,
    id: string,
  ): Promise<{
    id: string;
    slug: string;
    name: string;
    status: 'ACTIVE' | 'ARCHIVED';
  }> {
    const current = await transaction.department.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, slug: true, name: true, status: true },
    });
    if (!current) throw new OrganizationConfigDeniedError('NO_DEPARTMENT');
    return current;
  }
}
