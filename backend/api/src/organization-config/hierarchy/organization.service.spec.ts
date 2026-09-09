import type { Request } from 'express';
import { AUDIT_EVENT_TYPES } from '../../audit/audit-constants';
import { OrganizationConfigDeniedError } from '../organization-config.errors';
import { OrganizationService } from './organization.service';
import type {
  HierarchyOperations,
  HierarchyContext,
} from './hierarchy.operations';

const CTX: HierarchyContext = {
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

function makeOps(
  overrides: {
    authorized?: boolean;
    created?: unknown;
    updated?: unknown;
    archived?: unknown;
  } = {},
) {
  const authorize = jest.fn().mockResolvedValue(CTX);
  let created: unknown;
  const run = jest.fn().mockImplementation((_req, _ctx, eventType) => {
    if (eventType === AUDIT_EVENT_TYPES.ORGANIZATION_CREATED)
      return Promise.resolve(created);
    return Promise.resolve(created);
  });
  if (overrides.authorized === false) {
    authorize.mockRejectedValue(
      new OrganizationConfigDeniedError('MISSING_PERMISSION'),
    );
  }
  const ops = { authorize, run } as unknown as HierarchyOperations;
  const storage = { putObject: jest.fn() };
  const service = new OrganizationService(ops, storage as never);
  return { service, authorize, run };
}

describe('OrganizationService', () => {
  it('authorizes and creates an organization with the correct event type', async () => {
    const { service, authorize, run } = makeOps();
    const created = {
      id: 'o1',
      tenantId: CTX.tenantId,
      slug: 'firm',
      name: 'Firm',
      status: 'ACTIVE' as const,
    };
    run.mockResolvedValue(created);
    const result = await service.create(request(), {
      slug: 'firm',
      name: 'Firm',
    });
    expect(authorize).toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith(
      expect.anything(),
      CTX,
      AUDIT_EVENT_TYPES.ORGANIZATION_CREATED,
      'Organization',
      expect.any(Function),
      { slug: 'firm' },
    );
    expect(result).toEqual(created);
  });

  it('binds tenantId into the create data', async () => {
    const { service, run } = makeOps();
    run.mockImplementation((_req, _ctx, _et, _t, operation) => {
      const tx = {
        organization: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'o1',
            tenantId: CTX.tenantId,
            slug: 'firm',
            name: 'Firm',
            status: 'ACTIVE',
          }),
        },
      };
      return operation(tx);
    });
    const result = await service.create(request(), {
      slug: 'firm',
      name: 'Firm',
    });
    expect(result.tenantId).toBe(CTX.tenantId);
  });

  it('rejects an actor without permission', async () => {
    const { service } = makeOps({ authorized: false });
    await expect(
      service.create(request(), { slug: 'firm', name: 'Firm' }),
    ).rejects.toBeInstanceOf(OrganizationConfigDeniedError);
  });
});

describe('Hierarchy list reads', () => {
  it('lists organizations scoped to the tenant with a cap', async () => {
    const read = jest.fn().mockImplementation((_req, ctx, op) =>
      op({
        organization: { findMany: jest.fn().mockResolvedValue([]) },
      } as never),
    );
    const ops = {
      authorize: jest.fn().mockResolvedValue(CTX),
      run: jest.fn(),
      read,
    } as unknown as HierarchyOperations;
    const storage = { putObject: jest.fn() };
    const service = new OrganizationService(ops, storage as never);

    await service.list(request());

    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('OrganizationService profile guards', () => {
  function guardedService(orgs: unknown) {
    const authorize = jest.fn().mockResolvedValue({
      sessionId: 's1',
      userId: 'u1',
      tenantId: 't1',
      actorMembershipId: 'm1',
    });
    const run = jest
      .fn()
      .mockImplementation((_req, _ctx, _event, _target, op) =>
        op({
          organization: {
            findFirst: jest.fn().mockResolvedValue(orgs),
            create: jest.fn(),
          },
        }),
      );
    const storage = { putObject: jest.fn() };
    const ops = { authorize, run } as never;
    return { ops, storage, authorize, run };
  }

  it('refuses a second active organization', async () => {
    const { ops, storage } = guardedService({ id: 'existing' });
    const service = new OrganizationService(ops, storage as never);

    const second = await service
      .create({} as never, { slug: 'second', name: 'Second' } as never)
      .catch((error: unknown) => error);
    expect((second as { internalReason?: string }).internalReason).toBe(
      'ORG_EXISTS',
    );
  });

  it('rejects non-image logo uploads', async () => {
    const { ops, storage } = guardedService(null);
    const service = new OrganizationService(ops, storage as never);

    const logo = await service
      .uploadLogo({} as never, {
        buffer: Buffer.from('x'),
        mimetype: 'application/pdf',
        size: 10,
      })
      .catch((error: unknown) => error);
    expect((logo as { internalReason?: string }).internalReason).toBe(
      'INVALID_LOGO_TYPE',
    );
  });
});
