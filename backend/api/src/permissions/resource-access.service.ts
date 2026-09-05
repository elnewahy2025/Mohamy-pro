import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ResourceAccessDeniedError } from './permission.errors';

export type CaseAccessScope = 'FULL' | 'ASSIGNED';

/**
 * Central assignment-driven ABAC seam. All case-linked resource scoping
 * (cases, hearings, deadlines, tasks, documents, timeline) flows through
 * these two methods so the assignment rule lives in exactly one place.
 * Denials are non-enumerating: callers and observers cannot distinguish a
 * missing resource from a missing assignment.
 */
@Injectable()
export class ResourceAccessService {
  async requireAssignedCase(
    tx: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
    caseId: string,
  ): Promise<void> {
    const assignment = await tx.caseAssignment.findFirst({
      where: { caseId, membershipId, tenantId, revokedAt: null },
      select: { id: true },
    });
    if (!assignment) throw new ResourceAccessDeniedError();
  }

  async assignedCaseIds(
    tx: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
  ): Promise<string[]> {
    const rows = await tx.caseAssignment.findMany({
      where: { membershipId, tenantId, revokedAt: null },
      select: { caseId: true },
    });
    return rows.map((row) => row.caseId);
  }
}
