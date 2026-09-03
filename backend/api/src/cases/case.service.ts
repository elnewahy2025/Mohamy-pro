import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditLogService } from '../audit/audit-log.service';
import { AppSessionContext } from '../auth/app-session.context';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { CaseOperations } from './case.operations';
import { CaseGateRejectionError } from './case.errors';
import { ConflictGateService } from '../conflict-checks/conflict-gate.service';

export interface CreateCaseParams {
  title: string;
  referenceNumber: string;
  clientId?: string;
  notes?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export interface AddCasePartyParams {
  partyId: string;
  partyRoleId: string;
}

@Injectable()
export class CaseService {
  constructor(
    private readonly operations: CaseOperations,
    private readonly audit: AuditLogService,
    private readonly gateService: ConflictGateService,
  ) {}

  public async createCase(ctx: AppSessionContext, params: CreateCaseParams) {
    return this.operations.run(ctx.request!, async (tx) => {
      // Create the case
      const newCase = await tx.case.create({
        data: {
          tenantId: ctx.activeTenantId!,
          title: params.title,
          referenceNumber: params.referenceNumber,
          clientId: params.clientId,
          notes: params.notes,
          priority: params.priority ?? 'MEDIUM',
          status: 'OPEN',
        },
      });

      this.audit.record(ctx, {
        type: AUDIT_EVENT_TYPES.CASE_CREATED,
        targetId: newCase.id,
        targetType: 'CASE',
      });

      return newCase;
    });
  }

  public async addCaseParty(
    ctx: AppSessionContext,
    caseId: string,
    params: AddCasePartyParams,
  ) {
    return this.operations.run(ctx.request!, async (tx) => {
      const c = await this.operations.requireCaseInTenant(tx, ctx, caseId);

      // Verify party exists
      const party = await tx.party.findUnique({
        where: { id: params.partyId, tenantId: ctx.activeTenantId! },
      });
      if (!party) {
        throw new Error('Party not found');
      }

      // Assert clearance before adding a party
      const verdict = await this.gateService.assertClearForCase(
        tx,
        ctx.activeTenantId!,
        [{ name: party.name ?? party.displayName }],
      );

      if (!verdict.cleared) {
        throw new CaseGateRejectionError(
          'Cannot add party due to conflict block',
          verdict.blocks,
        );
      }

      const cp = await tx.caseParty.create({
        data: {
          tenantId: ctx.activeTenantId!,
          caseId: c.id,
          partyId: params.partyId,
          partyRoleId: params.partyRoleId,
        },
      });

      this.audit.record(ctx, {
        type: AUDIT_EVENT_TYPES.CASE_PARTY_ADDED,
        targetId: cp.id,
        targetType: 'CASE_PARTY',
      });

      return cp;
    });
  }
}
