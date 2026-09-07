import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiInvalidStateError } from './ai.errors';
import { REF_KINDS, type ValidatedRef } from './ai.dto';
import {
  ResourceAccessService,
  type CaseAccessScope,
} from '../permissions/resource-access.service';

export interface RetrievalScope {
  scope: CaseAccessScope;
  membershipId: string;
}

export interface ResolvedRef {
  kind: string;
  id: string;
  snapshot: Record<string, unknown>;
}

const CASE_SCALARS = [
  'id',
  'caseNumber',
  'status',
  'priority',
  'openDate',
  'practiceArea',
  'caseType',
] as const;

const DOCUMENT_SCALARS = [
  'id',
  'caseId',
  'title',
  'documentType',
  'status',
  'createdAt',
] as const;

@Injectable()
export class RetrievalService {
  constructor(private readonly resourceAccess: ResourceAccessService) {}

  async resolveRefs(
    tx: Prisma.TransactionClient,
    tenantId: string,
    access: RetrievalScope,
    refs: ValidatedRef[],
  ): Promise<ResolvedRef[]> {
    let caseIds: string[] | undefined;
    if (access.scope === 'ASSIGNED') {
      caseIds = await this.resourceAccess.assignedCaseIds(
        tx,
        tenantId,
        access.membershipId,
      );
    }
    const resolved: ResolvedRef[] = [];
    for (const ref of refs) {
      if (!REF_KINDS.includes(ref.kind as never)) {
        throw new AiInvalidStateError(`Unknown ref kind: ${ref.kind}`);
      }
      resolved.push(await this.resolveOne(tx, tenantId, caseIds, ref));
    }
    return resolved;
  }

  private pick(
    row: Record<string, unknown>,
    columns: readonly string[],
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const column of columns) {
      const value = row[column];
      out[column] =
        value instanceof Date ? value.toISOString() : (value ?? null);
    }
    return out;
  }

  private async resolveOne(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseIds: string[] | undefined,
    ref: ValidatedRef,
  ): Promise<ResolvedRef> {
    switch (ref.kind) {
      case 'CASE': {
        const row = await tx.case.findFirst({
          where: {
            id: ref.id,
            tenantId,
            ...(caseIds ? { id: { in: caseIds } } : {}),
          },
        });
        if (!row)
          throw new AiInvalidStateError(`Ref not in scope: CASE ${ref.id}`);
        return {
          kind: ref.kind,
          id: ref.id,
          snapshot: this.pick(row as Record<string, unknown>, CASE_SCALARS),
        };
      }
      case 'DOCUMENT': {
        const row = await tx.document.findFirst({
          where: { id: ref.id, tenantId },
        });
        if (!row)
          throw new AiInvalidStateError(`Ref not in scope: DOCUMENT ${ref.id}`);
        if (caseIds && (!row.caseId || !caseIds.includes(row.caseId))) {
          throw new AiInvalidStateError(`Ref not in scope: DOCUMENT ${ref.id}`);
        }
        return {
          kind: ref.kind,
          id: ref.id,
          snapshot: this.pick(row as Record<string, unknown>, DOCUMENT_SCALARS),
        };
      }
      case 'INTAKE': {
        const row = await tx.intakeRequest.findFirst({
          where: { id: ref.id, tenantId },
          select: {
            id: true,
            fullName: true,
            clientType: true,
            matterSummary: true,
            status: true,
          },
        });
        if (!row)
          throw new AiInvalidStateError(`Ref not in scope: INTAKE ${ref.id}`);
        return {
          kind: ref.kind,
          id: ref.id,
          snapshot: {
            id: row.id,
            fullName: row.fullName,
            clientType: row.clientType,
            matterSummary: row.matterSummary,
            status: row.status,
          },
        };
      }
      case 'DEADLINE': {
        const row = await tx.deadline.findFirst({
          where: { id: ref.id, tenantId },
          select: {
            id: true,
            caseId: true,
            title: true,
            deadlineType: true,
            dueDate: true,
            status: true,
          },
        });
        if (!row)
          throw new AiInvalidStateError(`Ref not in scope: DEADLINE ${ref.id}`);
        if (caseIds && !caseIds.includes(row.caseId)) {
          throw new AiInvalidStateError(`Ref not in scope: DEADLINE ${ref.id}`);
        }
        return {
          kind: ref.kind,
          id: ref.id,
          snapshot: {
            id: row.id,
            caseId: row.caseId,
            title: row.title,
            deadlineType: row.deadlineType,
            dueDate: row.dueDate.toISOString(),
            status: row.status,
          },
        };
      }
      default:
        throw new AiInvalidStateError(`Unknown ref kind: ${ref.kind}`);
    }
  }
}
