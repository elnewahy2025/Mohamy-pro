import type { Request } from 'express';
import { PortalOperations } from './portal.operations';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PortalAccessDeniedError } from './portal.errors';

function request(): Request {
  return {
    auth: { userId: 'u1', activeTenantId: 't1', sessionId: 's1' },
    headers: {},
  } as unknown as Request;
}

function operations(opts: { permitted: boolean; clientId?: string | null }) {
  const permissions = {
    assertTenantPermission: jest.fn(async () => {
      if (!opts.permitted) throw new Error('denied');
      return { membershipId: 'mem-1' };
    }),
  } as unknown as PermissionsService;
  const prisma = {
    withMembershipSelectionContext: jest.fn(
      (_ctx: unknown, cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          membership: {
            findFirst: jest
              .fn()
              .mockResolvedValue(
                opts.clientId === undefined
                  ? { clientId: 'cl1' }
                  : opts.clientId === null
                    ? { clientId: null }
                    : { clientId: opts.clientId },
              ),
          },
        }),
    ),
    withTenantContext: jest.fn(
      (_ctx: unknown, cb: (tx: unknown) => Promise<unknown>) => cb({}),
    ),
  } as unknown as PrismaService;
  return new PortalOperations(prisma, permissions);
}

describe('PortalOperations', () => {
  it('authorizes linked members with their client scope', async () => {
    const ops = operations({ permitted: true });

    const ctx = await ops.authorize(request());

    expect(ctx.clientId).toBe('cl1');
    expect(ctx.actorMembershipId).toBe('mem-1');
  });

  it('denies members without a linked client', async () => {
    const ops = operations({ permitted: true, clientId: null });

    await expect(ops.authorize(request())).rejects.toBeInstanceOf(
      PortalAccessDeniedError,
    );
  });

  it('denies members lacking the portal permission', async () => {
    const ops = operations({ permitted: false });

    await expect(ops.authorize(request())).rejects.toThrow('denied');
  });
});
