import type { Request } from 'express';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { ConflictCheckAccessDeniedError } from './conflict-check.errors';
import { ConflictCheckService } from './conflict-check.service';
import {
  ConflictCheckOperations,
  type ConflictCheckContext,
} from './conflict-check.operations';
import { ConflictMatchService } from './conflict-match.service';
import { ConflictGateService } from './conflict-gate.service';

const CTX: ConflictCheckContext = {
  sessionId: '33333333-3333-4333-8333-333333333333',
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: '44444444-4444-4444-8444-444444444444',
  actorMembershipId: '55555555-5555-4555-8555-555555555555',
};

function request(): Request {
  return {
    auth: {
      ...CTX,
      provider: 'oidc',
      providerSubject: 'sub',
      activeTenantId: CTX.tenantId,
    } as object,
    headers: {},
    ip: '1.2.3.4',
  } as unknown as Request;
}

const INPUT = {
  clientId: null,
  parties: [
    { kind: 'PARTY' as const, name: 'Acme Corp', email: 'legal@acme.com' },
    { kind: 'RELATED_ENTITY' as const, name: 'Acme Holdings', email: null },
  ],
};

function defaultTx() {
  return {
    conflictCheck: {
      create: jest.fn(),
      update: jest.fn(),
    },
    conflictParty: {
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    client: { findFirst: jest.fn() },
  };
}

function makeService(overrides: { authorized?: boolean } = {}) {
  const ops = {
    authorize: jest.fn().mockResolvedValue(CTX),
    run: jest
      .fn()
      .mockImplementation((_req, _ctx, _et, _t, operation) =>
        operation(defaultTx()),
      ),
    read: jest
      .fn()
      .mockImplementation((_req, _ctx, operation) => operation(defaultTx())),
    requireClientInTenant: jest.fn(),
  } as unknown as ConflictCheckOperations;
  if (overrides.authorized === false) {
    (ops.authorize as jest.Mock).mockRejectedValue(
      new ConflictCheckAccessDeniedError('MISSING_PERMISSION'),
    );
  }
  const matcher = new ConflictMatchService();
  const gate = new ConflictGateService();
  const service = new ConflictCheckService(ops, matcher);
  return { service, ops, matcher, gate };
}

describe('ConflictCheckService', () => {
  it('authorizes and requests a check with the created event type and party count', async () => {
    const { service, ops } = makeService();
    const created = {
      id: 'cc1',
      tenantId: CTX.tenantId,
      status: 'PENDING',
      requesterUserId: CTX.userId,
      clientId: null,
      decision: 'PENDING',
      reason: null,
      reviewerUserId: null,
      reviewedAt: null,
      matchSummary: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (ops.run as jest.Mock).mockImplementation(
      (_req, _ctx, _et, _t, operation) =>
        operation({
          conflictCheck: { create: jest.fn().mockResolvedValue(created) },
          conflictParty: {
            createMany: jest.fn().mockResolvedValue({ count: 2 }),
            findMany: jest.fn().mockResolvedValue([]),
          },
          client: {
            findFirst: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
          },
          clientContact: { findMany: jest.fn().mockResolvedValue([]) },
        }),
    );
    const result = await service.request(request(), INPUT);
    expect(ops.authorize).toHaveBeenCalled();
    expect(ops.run).toHaveBeenCalledWith(
      expect.anything(),
      CTX,
      AUDIT_EVENT_TYPES.CONFLICT_CHECK_CREATED,
      'ConflictCheck',
      expect.any(Function),
      { partyCount: 2 },
    );
    expect(result.id).toBe('cc1');
  });

  it('rejects when the requester lacks permission', async () => {
    const { service } = makeService({ authorized: false });
    await expect(service.request(request(), INPUT)).rejects.toBeInstanceOf(
      ConflictCheckAccessDeniedError,
    );
  });

  it('starts review with the in_review event type', async () => {
    const { service, ops } = makeService();
    const row = {
      id: 'cc1',
      tenantId: CTX.tenantId,
      status: 'IN_REVIEW',
      requesterUserId: CTX.userId,
      clientId: null,
      decision: 'PENDING',
      reason: null,
      reviewerUserId: null,
      reviewedAt: null,
      matchSummary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (ops.run as jest.Mock).mockImplementation(
      (_req, _ctx, _et, _t, operation) =>
        operation({
          conflictCheck: {
            findFirst: jest
              .fn()
              .mockResolvedValue({ ...row, status: 'PENDING' }),
            update: jest.fn().mockResolvedValue(row),
          },
          conflictParty: { findMany: jest.fn().mockResolvedValue([]) },
          client: { findFirst: jest.fn() },
        }),
    );
    await service.startReview(request(), 'cc1');
    expect(ops.run).toHaveBeenCalledWith(
      expect.anything(),
      CTX,
      AUDIT_EVENT_TYPES.CONFLICT_CHECK_IN_REVIEW,
      'ConflictCheck',
      expect.any(Function),
    );
  });

  it('records a BLOCK decision with the decided event type and decision metadata', async () => {
    const { service, ops } = makeService();
    const row = {
      id: 'cc1',
      tenantId: CTX.tenantId,
      status: 'COMPLETED',
      requesterUserId: CTX.userId,
      clientId: null,
      decision: 'BLOCK',
      reason: 'client of a competing matter',
      reviewerUserId: CTX.userId,
      reviewedAt: new Date(),
      matchSummary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (ops.run as jest.Mock).mockImplementation(
      (_req, _ctx, _et, _t, operation) =>
        operation({
          conflictCheck: {
            findFirst: jest
              .fn()
              .mockResolvedValue({ ...row, status: 'IN_REVIEW' }),
            update: jest.fn().mockResolvedValue(row),
          },
          conflictParty: { findMany: jest.fn().mockResolvedValue([]) },
          client: { findFirst: jest.fn() },
        }),
    );
    await service.decide(request(), {
      id: 'cc1',
      decision: 'BLOCK',
      reason: 'client of a competing matter',
    });
    expect(ops.run).toHaveBeenCalledWith(
      expect.anything(),
      CTX,
      AUDIT_EVENT_TYPES.CONFLICT_CHECK_DECIDED,
      'ConflictCheck',
      expect.any(Function),
      { decision: 'BLOCK' },
    );
  });

  it('gets and lists without emitting audit events (read path)', async () => {
    const { service, ops } = makeService();
    (ops.read as jest.Mock).mockImplementation((_req, _ctx, operation) =>
      operation({
        conflictCheck: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'cc1',
            tenantId: CTX.tenantId,
            status: 'COMPLETED',
            requesterUserId: CTX.userId,
            clientId: null,
            decision: 'ALLOW',
            reason: 'no conflict',
            reviewerUserId: CTX.userId,
            reviewedAt: new Date(),
            matchSummary: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'cc1',
              tenantId: CTX.tenantId,
              status: 'COMPLETED',
              requesterUserId: CTX.userId,
              clientId: null,
              decision: 'ALLOW',
              reviewerUserId: CTX.userId,
              createdAt: new Date(),
              updatedAt: new Date(),
              _count: { parties: 1 },
            },
          ]),
          count: jest.fn().mockResolvedValue(1),
        },
        conflictParty: { findMany: jest.fn().mockResolvedValue([]) },
        client: { findFirst: jest.fn() },
      }),
    );
    const one = await service.get(request(), 'cc1');
    expect(one.decision).toBe('ALLOW');
    const list = await service.list(request(), { page: 1, limit: 20 });
    expect(list.data).toHaveLength(1);
    expect(list.pagination.total).toBe(1);
  });
});
