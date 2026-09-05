import { Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { type Case, type CaseParty, Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import type { Paginated } from '../common/api/envelope';
import { ConflictGateService } from '../conflict-checks/conflict-gate.service';
import { CaseOperations } from './case.operations';
import { CaseAccessDeniedError, CaseGateRejectionError } from './case.errors';
import type {
  AddCasePartyDto,
  CaseQueryDto,
  CreateCaseDto,
  UpdateCaseDto,
} from './case.dto';

type CaseDetail = Prisma.CaseGetPayload<{
  include: {
    client: { select: { id: true; displayName: true } };
    parties: {
      include: {
        party: { select: { id: true; displayName: true; partyType: true } };
        role: { select: { id: true; key: true; label: true } };
      };
    };
  };
}>;

type CaseListItem = Prisma.CaseGetPayload<{
  include: {
    client: { select: { id: true; displayName: true } };
    parties: {
      select: { id: true; partyId: true; roleId: true; status: true };
    };
  };
}>;

@Injectable()
export class CaseService {
  constructor(
    private readonly ops: CaseOperations,
    private readonly gate: ConflictGateService,
  ) {}

  async createCase(request: Request, dto: CreateCaseDto): Promise<Case> {
    const ctx = await this.ops.authorize(request);
    const partyIds = dto.partyIds ?? [];
    return this.ops.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CASE_CREATED,
      'Case',
      async (tx) => {
        const client = await tx.client.findFirst({
          where: { id: dto.clientId, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!client) {
          throw new NotFoundException('Client not found in tenant');
        }

        await this.assertPartiesClear(tx, ctx, partyIds);

        const newCase = await tx.case.create({
          data: {
            tenantId: ctx.tenantId,
            caseNumber: dto.caseNumber,
            internalNumber: dto.internalNumber,
            clientId: dto.clientId,
            practiceArea: dto.practiceArea,
            caseType: dto.caseType,
            status: dto.status ?? 'OPEN',
            priority: dto.priority ?? 'NORMAL',
            openDate: dto.openDate ? new Date(dto.openDate) : null,
            closeDate: dto.closeDate ? new Date(dto.closeDate) : null,
          },
        });

        await tx.caseTimelineEvent.create({
          data: {
            tenantId: ctx.tenantId,
            caseId: newCase.id,
            eventType: 'CASE_CREATED',
            actorUserId: ctx.userId,
            actorMembershipId: ctx.actorMembershipId,
            payload: {
              caseNumber: newCase.caseNumber,
              status: newCase.status,
            },
          },
        });

        return newCase;
      },
      { caseNumber: dto.caseNumber, partyCount: partyIds.length },
    );
  }

  async getCase(request: Request, id: string): Promise<CaseDetail> {
    const ctx = await this.ops.authorizeCaseAccess(request);
    return this.ops.read(request, ctx, async (tx) => {
      if (ctx.scope === 'ASSIGNED') {
        await this.ops.requireCaseAssignment(tx, ctx, id);
      }
      const existing = await tx.case.findFirst({
        where: { id, tenantId: ctx.tenantId },
        include: {
          client: { select: { id: true, displayName: true } },
          parties: {
            include: {
              party: {
                select: { id: true, displayName: true, partyType: true },
              },
              role: { select: { id: true, key: true, label: true } },
            },
          },
        },
      });
      if (!existing) throw new NotFoundException('Case not found');
      return existing;
    });
  }

  async listCases(
    request: Request,
    query: CaseQueryDto,
  ): Promise<Paginated<CaseListItem>> {
    const ctx = await this.ops.authorizeCaseAccess(request);
    return this.ops.read(request, ctx, async (tx) => {
      const where: Prisma.CaseWhereInput = { tenantId: ctx.tenantId };
      if (ctx.scope === 'ASSIGNED') {
        where.id = { in: await this.ops.assignedCaseIds(tx, ctx) };
      }
      if (query.status) where.status = query.status;
      if (query.search) {
        where.OR = [
          { caseNumber: { contains: query.search, mode: 'insensitive' } },
          { internalNumber: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      const [items, total] = await Promise.all([
        tx.case.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            client: { select: { id: true, displayName: true } },
            parties: {
              select: { id: true, partyId: true, roleId: true, status: true },
            },
          },
        }),
        tx.case.count({ where }),
      ]);
      return { data: items, pagination: { total, page, limit } };
    });
  }

  async updateCase(
    request: Request,
    id: string,
    dto: UpdateCaseDto,
  ): Promise<Case> {
    const ctx = await this.ops.authorizeCaseAccess(request);
    return this.ops.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CASE_UPDATED,
      'Case',
      async (tx) => {
        const existing = await this.ops.requireCaseInTenant(tx, ctx, id);
        if (ctx.scope === 'ASSIGNED') {
          await this.ops.requireCaseAssignment(tx, ctx, id);
        }
        const updatedCase = await tx.case.update({
          where: { id, tenantId: ctx.tenantId },
          data: {
            caseNumber: dto.caseNumber,
            internalNumber: dto.internalNumber,
            practiceArea: dto.practiceArea,
            caseType: dto.caseType,
            status: dto.status,
            priority: dto.priority,
            openDate: dto.openDate ? new Date(dto.openDate) : undefined,
            closeDate: dto.closeDate ? new Date(dto.closeDate) : undefined,
          },
        });

        if (dto.status && dto.status !== existing.status) {
          await tx.caseTimelineEvent.create({
            data: {
              tenantId: ctx.tenantId,
              caseId: id,
              eventType: 'STATUS_CHANGED',
              actorUserId: ctx.userId,
              actorMembershipId: ctx.actorMembershipId,
              payload: {
                oldStatus: existing.status,
                newStatus: dto.status,
              },
            },
          });
        }

        return updatedCase;
      },
    );
  }

  async addParty(
    request: Request,
    caseId: string,
    dto: AddCasePartyDto,
  ): Promise<CaseParty> {
    const ctx = await this.ops.authorizeCaseAccess(request);
    return this.ops.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CASE_PARTY_ADDED,
      'CaseParty',
      async (tx) => {
        await this.ops.requireCaseInTenant(tx, ctx, caseId);
        if (ctx.scope === 'ASSIGNED') {
          await this.ops.requireCaseAssignment(tx, ctx, caseId);
        }

        const party = await tx.party.findFirst({
          where: { id: dto.partyId, tenantId: ctx.tenantId },
          select: { id: true, name: true, displayName: true },
        });
        if (!party) {
          throw new NotFoundException('Party not found in tenant');
        }

        const role = await tx.partyRole.findFirst({
          where: { id: dto.roleId, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!role) {
          throw new NotFoundException('Party role not found in tenant');
        }

        const verdict = await this.gate.assertClearForCase(tx, ctx.tenantId, [
          { name: party.name ?? party.displayName },
        ]);
        if (!verdict.cleared) {
          throw new CaseGateRejectionError(
            'Cannot add party due to conflict block',
            verdict.blocks,
          );
        }

        const caseParty = await tx.caseParty.create({
          data: {
            tenantId: ctx.tenantId,
            caseId,
            partyId: dto.partyId,
            roleId: dto.roleId,
          },
        });

        await tx.caseTimelineEvent.create({
          data: {
            tenantId: ctx.tenantId,
            caseId,
            eventType: 'PARTY_ADDED',
            actorUserId: ctx.userId,
            actorMembershipId: ctx.actorMembershipId,
            payload: {
              partyId: dto.partyId,
              roleId: dto.roleId,
            },
          },
        });

        return caseParty;
      },
      { partyId: dto.partyId, roleId: dto.roleId },
    );
  }

  async removeParty(request: Request, caseId: string, partyId: string) {
    const ctx = await this.ops.authorizeCaseAccess(request);
    return this.ops.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CASE_PARTY_REMOVED,
      'CaseParty',
      async (tx) => {
        await this.ops.requireCaseInTenant(tx, ctx, caseId);
        if (ctx.scope === 'ASSIGNED') {
          await this.ops.requireCaseAssignment(tx, ctx, caseId);
        }
        const result = await tx.caseParty.deleteMany({
          where: {
            tenantId: ctx.tenantId,
            caseId,
            partyId,
          },
        });
        if (result.count === 0) {
          throw new NotFoundException('Party link not found on case');
        }
        return { removed: result.count };
      },
      { partyId },
    );
  }

  async assignMember(request: Request, caseId: string, membershipId: string) {
    const ctx = await this.ops.authorize(request);
    return this.ops.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CASE_MEMBER_ASSIGNED,
      'CaseAssignment',
      async (tx) => {
        await this.ops.requireCaseInTenant(tx, ctx, caseId);
        const member = await tx.membership.findFirst({
          where: { id: membershipId, tenantId: ctx.tenantId },
          select: { id: true, status: true },
        });
        if (!member || member.status !== 'ACTIVE') {
          throw new NotFoundException('Membership not found in tenant');
        }
        const current = await tx.caseAssignment.findFirst({
          where: { caseId, membershipId, tenantId: ctx.tenantId },
        });
        if (current) {
          if (current.revokedAt === null) return current;
          return tx.caseAssignment.update({
            where: { id: current.id },
            data: { revokedAt: null },
          });
        }
        return tx.caseAssignment.create({
          data: {
            tenantId: ctx.tenantId,
            caseId,
            membershipId,
            createdByMembershipId: ctx.actorMembershipId,
          },
        });
      },
      { membershipId },
    );
  }

  async unassignMember(request: Request, caseId: string, membershipId: string) {
    const ctx = await this.ops.authorize(request);
    return this.ops.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CASE_MEMBER_REVOKED,
      'CaseAssignment',
      async (tx) => {
        await this.ops.requireCaseInTenant(tx, ctx, caseId);
        if (membershipId === ctx.actorMembershipId) {
          throw new CaseAccessDeniedError('SELF_UNASSIGN_FORBIDDEN');
        }
        const existing = await tx.caseAssignment.findFirst({
          where: { caseId, membershipId, tenantId: ctx.tenantId },
        });
        if (!existing) {
          throw new NotFoundException('Assignment not found on case');
        }
        return tx.caseAssignment.update({
          where: { id: existing.id },
          data: { revokedAt: new Date() },
        });
      },
      { membershipId },
    );
  }

  async listAssignees(request: Request, caseId: string) {
    const ctx = await this.ops.authorizeCaseAccess(request);
    return this.ops.read(request, ctx, async (tx) => {
      await this.ops.requireCaseInTenant(tx, ctx, caseId);
      if (ctx.scope === 'ASSIGNED') {
        await this.ops.requireCaseAssignment(tx, ctx, caseId);
      }
      return tx.caseAssignment.findMany({
        where: { caseId, tenantId: ctx.tenantId, revokedAt: null },
        select: { id: true, membershipId: true, assignedAt: true },
        orderBy: { assignedAt: 'asc' },
      });
    });
  }

  private async assertPartiesClear(
    tx: Prisma.TransactionClient,
    ctx: { tenantId: string },
    partyIds: string[],
  ): Promise<void> {
    if (partyIds.length === 0) return;
    const parties = await tx.party.findMany({
      where: { id: { in: partyIds }, tenantId: ctx.tenantId },
      select: { id: true, name: true, displayName: true },
    });
    const found: Record<string, string> = {};
    for (const p of parties) found[p.id] = p.name ?? p.displayName;

    const missing = partyIds.filter((id) => !found[id]);
    if (missing.length > 0) {
      throw new NotFoundException('One or more parties not found in tenant');
    }

    const prospective = partyIds.map((id) => ({ name: found[id] }));
    const verdict = await this.gate.assertClearForCase(
      tx,
      ctx.tenantId,
      prospective,
    );
    if (!verdict.cleared) {
      throw new CaseGateRejectionError(
        'One or more parties blocked by conflict check',
        verdict.blocks,
      );
    }
  }
}
