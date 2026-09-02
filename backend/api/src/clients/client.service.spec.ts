import type { Request } from 'express';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { ClientAccessDeniedError } from './clients.errors';
import { ClientService } from './client.service';
import type { ClientOperations, ClientContext } from './client.operations';

const CTX: ClientContext = {
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

function makeOps(overrides: { authorized?: boolean } = {}) {
  const authorize = jest.fn().mockResolvedValue(CTX);
  const run = jest.fn().mockImplementation((_req, _ctx, _et, _t, operation) =>
    operation({
      client: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
    }),
  );
  const read = jest.fn().mockImplementation((_req, _ctx, operation) =>
    operation({
      client: {
        findFirst: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
    }),
  );
  if (overrides.authorized === false) {
    authorize.mockRejectedValue(
      new ClientAccessDeniedError('MISSING_PERMISSION'),
    );
  }
  const ops = { authorize, run, read } as unknown as ClientOperations;
  const service = new ClientService(ops);
  return { service, authorize, run, read };
}

const INPUT = {
  clientType: 'INDIVIDUAL' as const,
  name: 'Ahmed Hassan',
  legalName: null,
  source: 'referral',
  notes: 'intro call done',
};

describe('ClientService', () => {
  it('authorizes and creates a client with the correct event type', async () => {
    const { service, authorize, run } = makeOps();
    const created = {
      id: 'c1',
      tenantId: CTX.tenantId,
      clientType: 'INDIVIDUAL',
      name: 'Ahmed Hassan',
      legalName: null,
      displayName: 'Ahmed Hassan',
      status: 'ACTIVE',
      source: 'referral',
      notes: 'intro call done',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    run.mockResolvedValue(created);
    const result = await service.create(request(), INPUT);
    expect(authorize).toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith(
      expect.anything(),
      CTX,
      AUDIT_EVENT_TYPES.CLIENT_CREATED,
      'Client',
      expect.any(Function),
      { clientType: 'INDIVIDUAL' },
    );
    expect(result).toEqual(created);
  });

  it('binds tenantId and client type into the create data', async () => {
    const { service, run } = makeOps();
    run.mockImplementation((_req, _ctx, _et, _t, operation) => {
      const create = jest.fn().mockResolvedValue({
        id: 'c1',
        tenantId: CTX.tenantId,
        clientType: 'ORGANIZATION',
        name: 'Alpha Trading',
        legalName: 'Alpha Trading Co LLC',
        displayName: 'Alpha Trading (Alpha Trading Co LLC)',
        status: 'ACTIVE',
        source: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return operation({ client: { create } });
    });
    const result = await service.create(request(), {
      clientType: 'ORGANIZATION',
      name: 'Alpha Trading',
      legalName: 'Alpha Trading Co LLC',
    });
    expect(result.tenantId).toBe(CTX.tenantId);
    expect(result.clientType).toBe('ORGANIZATION');
  });

  it('rejects an actor without permission', async () => {
    const { service } = makeOps({ authorized: false });
    await expect(service.create(request(), INPUT)).rejects.toBeInstanceOf(
      ClientAccessDeniedError,
    );
  });

  it('archives with a reason via the archived event type', async () => {
    const { service, run } = makeOps();
    run.mockImplementation((_req, _ctx, _et, _t, operation) =>
      operation({
        client: {
          update: jest.fn().mockResolvedValue({
            id: 'c1',
            tenantId: CTX.tenantId,
            clientType: 'INDIVIDUAL',
            name: 'Ahmed',
            legalName: null,
            displayName: 'Ahmed',
            status: 'ARCHIVED',
            source: null,
            notes: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
          findFirst: jest.fn().mockResolvedValue({ id: 'c1' }),
        },
      }),
    );
    await service.archive(request(), 'c1', 'duplicate');
    expect(run).toHaveBeenCalledWith(
      expect.anything(),
      CTX,
      AUDIT_EVENT_TYPES.CLIENT_ARCHIVED,
      'Client',
      expect.any(Function),
      { reason: 'duplicate' },
    );
  });

  it('lists with paging and search without emitting an audit event (read)', async () => {
    const { service, read } = makeOps();
    read.mockImplementation((_req, _ctx, operation) =>
      operation({
        client: {
          count: jest.fn().mockResolvedValue(2),
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'c1',
              tenantId: CTX.tenantId,
              clientType: 'INDIVIDUAL',
              name: 'Ahmed',
              legalName: null,
              displayName: 'Ahmed',
              status: 'ACTIVE',
              source: null,
              notes: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        },
      }),
    );
    const result = await service.list(request(), {
      page: 1,
      limit: 20,
      search: 'ahmed',
      status: 'ACTIVE',
    });
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 2 });
    expect(result.data).toHaveLength(1);
  });
});
