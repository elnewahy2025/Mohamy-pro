import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { type Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import type { Paginated } from '../common/api/envelope';
import { ConflictCheckAccessDeniedError } from './conflict-check.errors';
import {
  ConflictCheckOperations,
  type ConflictCheckContext,
} from './conflict-check.operations';
import { ConflictMatchService } from './conflict-match.service';

export interface ConflictPartyInput {
  kind: 'PARTY' | 'RELATED_ENTITY';
  name: string;
  email?: string | null;
}

export interface CreateConflictCheckInput {
  clientId?: string | null;
  parties: ConflictPartyInput[];
}

export interface DecideConflictCheckInput {
  id: string;
  decision: 'ALLOW' | 'BLOCK';
  reason?: string;
}

export interface ListConflictCheckQuery {
  page: number;
  limit: number;
  status?: 'PENDING' | 'IN_REVIEW' | 'COMPLETED';
}

export interface ConflictPartyResult {
  id: string;
  tenantId: string;
  kind: 'PARTY' | 'RELATED_ENTITY';
  name: string;
  normalizedName: string;
  email: string | null;
}

export interface ConflictCheckResult {
  id: string;
  tenantId: string;
  status: 'PENDING' | 'IN_REVIEW' | 'COMPLETED';
  requesterUserId: string;
  clientId: string | null;
  decision: 'PENDING' | 'ALLOW' | 'BLOCK';
  reason: string | null;
  reviewerUserId: string | null;
  reviewedAt: Date | null;
  matchSummary: unknown[] | null;
  createdAt: Date;
  updatedAt: Date;
  parties: ConflictPartyResult[];
}

export interface ConflictCheckListRow {
  id: string;
  tenantId: string;
  status: 'PENDING' | 'IN_REVIEW' | 'COMPLETED';
  requesterUserId: string;
  clientId: string | null;
  decision: 'PENDING' | 'ALLOW' | 'BLOCK';
  reviewerUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  partyCount: number;
  _count?: { parties?: number };
}

/** Raw persisted row (matchSummary is stored as a JSON string). */
interface ConflictCheckRow {
  id: string;
  tenantId: string;
  status: 'PENDING' | 'IN_REVIEW' | 'COMPLETED';
  requesterUserId: string;
  clientId: string | null;
  decision: 'PENDING' | 'ALLOW' | 'BLOCK';
  reason: string | null;
  reviewerUserId: string | null;
  reviewedAt: Date | null;
  matchSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const TARGET = 'ConflictCheck';

const CHECK_SELECT = {
  id: true,
  tenantId: true,
  status: true,
  requesterUserId: true,
  clientId: true,
  decision: true,
  reason: true,
  reviewerUserId: true,
  reviewedAt: true,
  matchSummary: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PARTY_SELECT = {
  id: true,
  tenantId: true,
  kind: true,
  name: true,
  normalizedName: true,
  email: true,
} as const;

/**
 * Tenant-scoped Conflict Check Foundation entity. Guarded by the
 * CanManageConflictChecks policy; mutations run inside the tenant context (RLS)
 * and emit an audit event atomically (see ConflictCheckOperations). A check
 * progresses PENDING -> IN_REVIEW -> COMPLETED, with a final ALLOW/BLOCK decision
 * and reason recorded by the reviewer. Levels: request, startReview, decide,
 * get, list.
 */
@Injectable()
export class ConflictCheckService {
  constructor(
    private readonly ops: ConflictCheckOperations,
    private readonly matcher: ConflictMatchService,
  ) {}

  async request(
    request: Request,
    input: CreateConflictCheckInput,
  ): Promise<ConflictCheckResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<ConflictCheckResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CONFLICT_CHECK_CREATED,
      TARGET,
      async (transaction) => {
        if (input.clientId) {
          await this.ops.requireClientInTenant(
            transaction,
            ctx,
            input.clientId,
          );
        }
        const match = await this.matcher.match(
          transaction,
          ctx.tenantId,
          input.parties,
        );
        const check = await transaction.conflictCheck.create({
          data: {
            tenantId: ctx.tenantId,
            requesterUserId: ctx.userId,
            clientId: input.clientId ?? null,
            matchSummary: match.length > 0 ? JSON.stringify(match) : null,
          },
          select: CHECK_SELECT,
        });
        const partyRows = await transaction.conflictParty.createMany({
          data: input.parties.map((p) => ({
            tenantId: ctx.tenantId,
            conflictCheckId: check.id,
            kind: p.kind,
            name: p.name,
            normalizedName: this.matcher.normalize(p.name),
            email: p.email ?? null,
          })),
        });
        const parties = await transaction.conflictParty.findMany({
          where: { conflictCheckId: check.id, tenantId: ctx.tenantId },
          orderBy: { createdAt: 'asc' },
          select: PARTY_SELECT,
        });
        void partyRows;
        return this.toResult(check, parties);
      },
      { partyCount: input.parties.length },
    );
  }

  async startReview(
    request: Request,
    id: string,
  ): Promise<ConflictCheckResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<ConflictCheckResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CONFLICT_CHECK_IN_REVIEW,
      TARGET,
      async (transaction) => {
        const current = await this.requireCheck(transaction, ctx, id);
        if (current.status === 'COMPLETED')
          throw new ConflictCheckAccessDeniedError('CHECK_ALREADY_COMPLETED');
        const updated = await transaction.conflictCheck.update({
          where: { id: current.id },
          data: { status: 'IN_REVIEW' },
          select: CHECK_SELECT,
        });
        return this.resultWithParties(transaction, ctx, updated);
      },
    );
  }

  async decide(
    request: Request,
    input: DecideConflictCheckInput,
  ): Promise<ConflictCheckResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.run<ConflictCheckResult>(
      request,
      ctx,
      AUDIT_EVENT_TYPES.CONFLICT_CHECK_DECIDED,
      TARGET,
      async (transaction) => {
        const current = await this.requireCheck(transaction, ctx, input.id);
        if (current.status === 'COMPLETED')
          throw new ConflictCheckAccessDeniedError('CHECK_ALREADY_COMPLETED');
        const updated = await transaction.conflictCheck.update({
          where: { id: current.id },
          data: {
            status: 'COMPLETED',
            decision: input.decision,
            reason: input.reason ?? null,
            reviewerUserId: ctx.userId,
            reviewedAt: new Date(),
          },
          select: CHECK_SELECT,
        });
        return this.resultWithParties(transaction, ctx, updated);
      },
      { decision: input.decision },
    );
  }

  async get(request: Request, id: string): Promise<ConflictCheckResult> {
    const ctx = await this.ops.authorize(request);
    return this.ops.read<ConflictCheckResult>(
      request,
      ctx,
      async (transaction) => {
        const check = await this.requireCheck(transaction, ctx, id);
        return this.resultWithParties(transaction, ctx, check);
      },
    );
  }

  async list(
    request: Request,
    query: ListConflictCheckQuery,
  ): Promise<Paginated<ConflictCheckListRow>> {
    const ctx = await this.ops.authorize(request);
    return this.ops.read<Paginated<ConflictCheckListRow>>(
      request,
      ctx,
      async (transaction) => {
        const where: Prisma.ConflictCheckWhereInput = {
          tenantId: ctx.tenantId,
        };
        if (query.status) where.status = query.status;
        const [total, rows] = await Promise.all([
          transaction.conflictCheck.count({ where }),
          transaction.conflictCheck.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (query.page - 1) * query.limit,
            take: query.limit,
            select: {
              ...CHECK_SELECT,
              _count: { select: { parties: true } },
            },
          }),
        ]);
        return {
          data: rows.map((row) => ({
            id: row.id,
            tenantId: row.tenantId,
            status: row.status,
            requesterUserId: row.requesterUserId,
            clientId: row.clientId,
            decision: row.decision,
            reviewerUserId: row.reviewerUserId,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            partyCount: row._count.parties,
          })),
          pagination: { page: query.page, limit: query.limit, total },
        };
      },
    );
  }

  private async resultWithParties(
    transaction: Prisma.TransactionClient,
    ctx: ConflictCheckContext,
    check: ConflictCheckRow,
  ): Promise<ConflictCheckResult> {
    const parties = await transaction.conflictParty.findMany({
      where: { conflictCheckId: check.id, tenantId: ctx.tenantId },
      orderBy: { createdAt: 'asc' },
      select: PARTY_SELECT,
    });
    return this.toResult(check, parties);
  }

  private async requireCheck(
    transaction: Prisma.TransactionClient,
    ctx: ConflictCheckContext,
    id: string,
  ): Promise<ConflictCheckRow> {
    const found = await transaction.conflictCheck.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: CHECK_SELECT,
    });
    if (!found) throw new ConflictCheckAccessDeniedError('NO_CHECK');
    return found as ConflictCheckRow;
  }

  private toResult(
    check: ConflictCheckRow,
    parties: ConflictPartyResult[],
  ): ConflictCheckResult {
    let matchSummary: unknown[] | null = null;
    if (typeof check.matchSummary === 'string') {
      try {
        matchSummary = JSON.parse(check.matchSummary) as unknown[];
      } catch {
        matchSummary = null;
      }
    }
    const { matchSummary: _raw, ...rest } = check;
    return { ...rest, matchSummary, parties };
  }
}
