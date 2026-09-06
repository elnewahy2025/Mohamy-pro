import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditEventService } from '../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
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
  constructor(private readonly audit: AuditEventService) {}

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
    if (assignment) return;
    const now = new Date();
    const grant = await tx.breakGlassActivation.findFirst({
      where: {
        tenantId,
        subjectMembershipId: membershipId,
        caseId,
        revokedAt: null,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      select: { id: true },
    });
    if (!grant) throw new ResourceAccessDeniedError();
    const subject = await tx.membership.findFirst({
      where: { id: membershipId, tenantId },
      select: { userId: true },
    });
    await this.audit.write(
      {
        eventType: AUDIT_EVENT_TYPES.BREAKGLASS_USED,
        outcome: 'SUCCEEDED',
        actorUserId: subject?.userId ?? null,
        actorMembershipId: membershipId,
        tenantId,
        targetType: 'case',
        targetId: caseId,
        policy: 'BreakGlass',
        correlationId: `breakglass:${grant.id}`,
        metadata: { grantId: grant.id },
      },
      tx,
    );
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
