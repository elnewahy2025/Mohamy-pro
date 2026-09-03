import type { Request } from 'express';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { ClientAccessDeniedError } from './clients.errors';
import { ClientContactService } from './contact.service';
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

function defaultTx(overrides: Record<string, unknown> = {}) {
  return {
    clientContact: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    client: { findFirst: jest.fn() },
    ...overrides,
  };
}

function makeOps(
  overrides: { authorized?: boolean; clientInTenant?: boolean } = {},
) {
  const authorize = jest.fn().mockResolvedValue(CTX);
  const requireClientInTenant = jest.fn().mockResolvedValue(undefined);
  const run = jest
    .fn()
    .mockImplementation((_req, _ctx, _et, _t, operation) =>
      operation(defaultTx()),
    );
  if (overrides.authorized === false) {
    authorize.mockRejectedValue(
      new ClientAccessDeniedError('MISSING_PERMISSION'),
    );
  }
  if (overrides.clientInTenant === false) {
    requireClientInTenant.mockRejectedValue(
      new ClientAccessDeniedError('NO_CLIENT_IN_TENANT'),
    );
  }
  const ops = {
    authorize,
    run,
    requireClientInTenant,
  } as unknown as ClientOperations;
  const service = new ClientContactService(ops);
  return { service, authorize, run, requireClientInTenant };
}

const INPUT = {
  clientId: 'c1',
  type: 'PHONE' as const,
  value: '+2023456789',
  label: 'office',
  isPrimary: true,
};

describe('ClientContactService', () => {
  it('authorizes and creates a contact with the correct event type', async () => {
    const { service, authorize, run, requireClientInTenant } = makeOps();
    const created = {
      id: 'ct1',
      tenantId: CTX.tenantId,
      clientId: 'c1',
      type: 'PHONE',
      value: '+2023456789',
    };
    run.mockImplementation((_req, _ctx, _et, _t, operation) =>
      operation(
        defaultTx({
          clientContact: {
            create: jest.fn().mockResolvedValue(created),
            update: jest.fn(),
            delete: jest.fn(),
            updateMany: jest.fn(),
            findFirst: jest.fn(),
          },
        }),
      ),
    );
    const result = await service.create(request(), INPUT);
    expect(authorize).toHaveBeenCalled();
    expect(requireClientInTenant).toHaveBeenCalledWith(
      expect.anything(),
      CTX,
      'c1',
    );
    expect(run).toHaveBeenCalledWith(
      expect.anything(),
      CTX,
      AUDIT_EVENT_TYPES.CLIENT_CONTACT_CREATED,
      'ClientContact',
      expect.any(Function),
      { type: 'PHONE' },
    );
    expect(result).toEqual(created);
  });

  it('rejects when the parent client is not in the tenant', async () => {
    const { service } = makeOps({ clientInTenant: false });
    await expect(service.create(request(), INPUT)).rejects.toBeInstanceOf(
      ClientAccessDeniedError,
    );
  });

  it('rejects an actor without permission', async () => {
    const { service } = makeOps({ authorized: false });
    await expect(service.create(request(), INPUT)).rejects.toBeInstanceOf(
      ClientAccessDeniedError,
    );
  });

  it('removes a contact via the removed event type with a reason', async () => {
    const { service, run } = makeOps();
    run.mockImplementation((_req, _ctx, _et, _t, operation) =>
      operation(
        defaultTx({
          clientContact: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'ct1',
              clientId: 'c1',
              type: 'PHONE',
            }),
            delete: jest.fn().mockResolvedValue({}),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
          },
        }),
      ),
    );
    await service.remove(request(), 'ct1', 'duplicate');
    expect(run).toHaveBeenCalledWith(
      expect.anything(),
      CTX,
      AUDIT_EVENT_TYPES.CLIENT_CONTACT_REMOVED,
      'ClientContact',
      expect.any(Function),
      { reason: 'duplicate' },
    );
  });
});
