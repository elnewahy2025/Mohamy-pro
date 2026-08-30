import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { AuditEventService } from '../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { PrismaService } from '../infrastructure/database/prisma.service';
import type { OutboxService } from '../infrastructure/outbox/outbox.service';
import { BootstrapConfigService } from './bootstrap.config';
import {
  BootstrapDeniedError,
  BootstrapNotConfiguredError,
} from './bootstrap.errors';
import { BootstrapService } from './bootstrap.service';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const CONFIG = {
  subject: 'bootstrapper-subject',
  secret: 'one-time-bootstrap-secret-123',
  tenantSlug: 'acme',
  tenantName: 'Acme Corp',
  organizationSlug: 'acme-inc',
  organizationName: 'Acme Incorporated',
  mfaMaxAgeSeconds: 900,
};

function freshMfaAt(): Date {
  return new Date(Date.now() + 60_000);
}

const AUTHENTICATED = {
  sessionId: SESSION_ID,
  userId: USER_ID,
  provider: 'oidc',
  providerSubject: CONFIG.subject,
  activeTenantId: null,
};

function request(overrides: { auth?: unknown } = {}): Request {
  const auth =
    'auth' in overrides
      ? (overrides.auth as object | null | undefined)
      : AUTHENTICATED;
  return {
    auth: auth ?? undefined,
    ip: '127.0.0.1',
    headers: {},
    header: jest.fn(() => 'test-correlation-id'),
  } as unknown as Request;
}

function makeService(input: {
  config?: typeof CONFIG | null;
  session?: { providerSubject: string; mfaVerifiedAt: Date | null };
  platformBootstrapExists?: boolean;
  activePlatformAdminExists?: boolean;
  withTenantContextError?: Error;
  auditWrite?: jest.Mock;
}) {
  const config = input.config === undefined ? CONFIG : input.config;
  const configService = {
    load: jest.fn().mockReturnValue(config),
  } as unknown as BootstrapConfigService;

  const session = input.session ?? {
    providerSubject: CONFIG.subject,
    mfaVerifiedAt: freshMfaAt(),
  };
  const auditWrite =
    input.auditWrite ?? jest.fn().mockResolvedValue({ id: 'audit-1' });
  const audit = { write: auditWrite } as unknown as AuditEventService;
  const outboxCreate = jest.fn().mockResolvedValue({ id: 'outbox-1' });
  const outbox = { create: outboxCreate } as unknown as OutboxService;

  const membershipSelection = jest.fn(
    (context: unknown, callback: (tx: unknown) => Promise<unknown>) => {
      void context;
      return callback({ auditEvent: { create: jest.fn() } });
    },
  );

  const tenantTx = {
    tenant: { create: jest.fn().mockResolvedValue({ id: 't' }) },
    organization: { create: jest.fn().mockResolvedValue({ id: 'o' }) },
    membership: { create: jest.fn().mockResolvedValue({ id: 'm' }) },
    role: {
      findFirst: jest.fn().mockResolvedValue({ id: 'global-role' }),
      create: jest.fn().mockResolvedValue({ id: 'tenant-role' }),
    },
    globalRoleAssignment: {
      create: jest.fn().mockResolvedValue({ id: 'gra-1' }),
    },
    membershipRole: { create: jest.fn().mockResolvedValue({ id: 'mr-1' }) },
    platformBootstrap: {
      create: jest.fn().mockResolvedValue({ id: 'bootstrap-1' }),
    },
  };

  const tenantContext = jest.fn(
    (context: unknown, callback: (tx: unknown) => Promise<unknown>) => {
      void context;
      if (input.withTenantContextError) {
        return Promise.reject(input.withTenantContextError);
      }
      return callback(tenantTx);
    },
  );

  const appSessionFindUnique = jest.fn().mockResolvedValue(session);
  const prisma = {
    appSession: {
      findUnique: appSessionFindUnique,
    },
    platformBootstrap: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          input.platformBootstrapExists ? { id: 'existing' } : null,
        ),
    },
    globalRoleAssignment: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          input.activePlatformAdminExists ? { id: 'existing-gra' } : null,
        ),
    },
    withMembershipSelectionContext: membershipSelection,
    withTenantContext: tenantContext,
  } as unknown as PrismaService;

  const service = new BootstrapService(prisma, audit, outbox, configService);
  return {
    service,
    auditWrite,
    tenantContext,
    tenantTx,
    outboxCreate,
    appSessionFindUnique,
    prisma,
    configService,
  };
}

describe('BootstrapService', () => {
  it('creates the first tenant hierarchy and platform assignments atomically', async () => {
    const {
      service,
      tenantContext,
      tenantTx,
      outboxCreate,
      appSessionFindUnique,
    } = makeService({});

    const result = await service.bootstrap(request(), CONFIG.secret);

    expect(result).toEqual({
      tenantId: expect.any(String),
      slug: 'acme',
      name: 'Acme Corp',
      organizationId: expect.any(String),
      membershipId: expect.any(String),
    });

    const context = tenantContext.mock.calls[0][0];
    expect(context.tenantId).toBe(result.tenantId);
    expect(context.userId).toBe(USER_ID);
    expect(context.membershipId).toBe(result.membershipId);
    expect(context.operationId).toBe(SESSION_ID);

    expect(tenantTx.platformBootstrap.create).toHaveBeenCalledTimes(1);
    expect(tenantTx.organization.create).toHaveBeenCalledTimes(1);
    expect(tenantTx.membership.create).toHaveBeenCalledTimes(1);
    expect(tenantTx.globalRoleAssignment.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        roleId: 'global-role',
        assignedAt: expect.any(Date),
      },
    });
    expect(tenantTx.membershipRole.create).toHaveBeenCalledWith({
      data: {
        tenantId: result.tenantId,
        membershipId: result.membershipId,
        roleId: 'tenant-role',
        assignedAt: expect.any(Date),
      },
    });
    expect(outboxCreate).toHaveBeenCalledTimes(1);
    expect(appSessionFindUnique).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      select: { providerSubject: true, mfaVerifiedAt: true },
    });
  });

  it('records a denied audit event with reason code for the refusal', async () => {
    const { service, auditWrite } = makeService({
      session: { providerSubject: CONFIG.subject, mfaVerifiedAt: null },
    });

    await expect(
      service.bootstrap(request(), CONFIG.secret),
    ).rejects.toBeInstanceOf(BootstrapDeniedError);
    const [input, transaction] = auditWrite.mock.calls[0];
    expect(input.eventType).toBe(AUDIT_EVENT_TYPES.TENANT_BOOTSTRAP_DENIED);
    expect(input.outcome).toBe('DENIED');
    expect(input.tenantId).toBeNull();
    expect(input.reasonCode).toBe('MFA_REQUIRED');
    expect(transaction).toBeDefined();
  });

  it('denies when the OIDC subject does not match', async () => {
    const { service, auditWrite } = makeService({
      config: { ...CONFIG, subject: 'different-subject' },
    });

    await expect(
      service.bootstrap(request(), CONFIG.secret),
    ).rejects.toBeInstanceOf(BootstrapDeniedError);
    const input = auditWrite.mock.calls[0][0];
    expect(input.reasonCode).toBe('SUBJECT_MISMATCH');
  });

  it('denies when recent MFA is absent', async () => {
    const { service, auditWrite } = makeService({
      session: { providerSubject: CONFIG.subject, mfaVerifiedAt: null },
    });

    await expect(
      service.bootstrap(request(), CONFIG.secret),
    ).rejects.toBeInstanceOf(BootstrapDeniedError);
    const input = auditWrite.mock.calls[0][0];
    expect(input.reasonCode).toBe('MFA_REQUIRED');
  });

  it('denies when MFA is stale (older than the maximum age)', async () => {
    const { service, auditWrite } = makeService({
      session: {
        providerSubject: CONFIG.subject,
        mfaVerifiedAt: new Date(Date.now() - 1_000_000),
      },
    });

    await expect(
      service.bootstrap(request(), CONFIG.secret),
    ).rejects.toBeInstanceOf(BootstrapDeniedError);
    const input = auditWrite.mock.calls[0][0];
    expect(input.reasonCode).toBe('MFA_STALE');
  });

  it('denies when the one-time secret does not match', async () => {
    const { service, auditWrite } = makeService({});

    await expect(
      service.bootstrap(request(), 'wrong-secret'),
    ).rejects.toBeInstanceOf(BootstrapDeniedError);
    const input = auditWrite.mock.calls[0][0];
    expect(input.reasonCode).toBe('SECRET_MISMATCH');
  });

  it('refuses to repeat once a PlatformBootstrap marker exists', async () => {
    const { service, auditWrite } = makeService({
      platformBootstrapExists: true,
    });

    await expect(
      service.bootstrap(request(), CONFIG.secret),
    ).rejects.toBeInstanceOf(BootstrapDeniedError);
    const input = auditWrite.mock.calls[0][0];
    expect(input.reasonCode).toBe('ALREADY_BOOTSTRAPPED');
  });

  it('refuses when an active global platform admin assignment exists', async () => {
    const { service, auditWrite } = makeService({
      activePlatformAdminExists: true,
    });

    await expect(
      service.bootstrap(request(), CONFIG.secret),
    ).rejects.toBeInstanceOf(BootstrapDeniedError);
    const input = auditWrite.mock.calls[0][0];
    expect(input.reasonCode).toBe('PLATFORM_ADMIN_EXISTS');
  });

  it('collapses every denial into a single non-enumerating FORBIDDEN error', async () => {
    const cases: Array<[Record<string, unknown>, string, string]> = [
      [{ config: { ...CONFIG, subject: 'x' } }, CONFIG.secret, 'null'],
      [
        { session: { providerSubject: CONFIG.subject, mfaVerifiedAt: null } },
        CONFIG.secret,
        'null',
      ],
      [{}, 'wrong-secret', 'null'],
      [{ platformBootstrapExists: true }, CONFIG.secret, 'null'],
      [{ activePlatformAdminExists: true }, CONFIG.secret, 'null'],
    ];
    for (const [overrides, secret] of cases) {
      const { service } = makeService(overrides);
      try {
        await service.bootstrap(request(), secret);
        throw new Error('expected denial');
      } catch (error) {
        expect(error).toBeInstanceOf(BootstrapDeniedError);
        const denied = error as BootstrapDeniedError;
        expect(denied.getStatus()).toBe(403);
        expect(denied.code).toBe('FORBIDDEN');
        expect(denied.message).toBe('Platform bootstrap is not permitted.');
      }
    }
  });

  it('rejects unauthenticated requests as a denial', async () => {
    const { service } = makeService({});
    await expect(
      service.bootstrap(request({ auth: null }), CONFIG.secret),
    ).rejects.toBeInstanceOf(BootstrapDeniedError);
  });

  it('fails closed when bootstrap is not configured', async () => {
    const { service } = makeService({ config: null });
    await expect(
      service.bootstrap(request(), CONFIG.secret),
    ).rejects.toBeInstanceOf(BootstrapNotConfiguredError);
  });

  it('converts a concurrent singleton violation into an already-bootstrapped denial', async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );
    const { service } = makeService({
      withTenantContextError: uniqueError,
    });

    await expect(
      service.bootstrap(request(), CONFIG.secret),
    ).rejects.toBeInstanceOf(BootstrapDeniedError);
  });

  it('rethrows non-unique transaction errors unchanged', async () => {
    const boom = new Error('something else');
    const { service } = makeService({ withTenantContextError: boom });

    await expect(service.bootstrap(request(), CONFIG.secret)).rejects.toThrow(
      'something else',
    );
  });
});
