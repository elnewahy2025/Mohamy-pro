import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AbuseControlService } from '../../abuse/abuse-control.service';
import { MFA_RATE_LIMITED } from '../../abuse/abuse-control.constants';
import { AbuseLimitReachedError } from '../../abuse/abuse-control.errors';
import type { ValidatedEnvironment } from '../../config/env.validation';
import { AuditEventService } from '../../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../../audit/audit-constants';
import { MfaAssuranceService } from '../../auth/mfa/mfa-assurance.service';
import { MfaStepUpRequiredError } from '../../auth/mfa/mfa.errors';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { PERMISSION_KEYS } from '../../permissions/permission.constants';
import type { PermissionsService } from '../../permissions/permissions.service';
import { InvitationDeniedError } from './invitation.errors';
import { InvitationService } from './invitation.service';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_ID = '44444444-4444-4444-8444-444444444444';
const MEMBERSHIP_ID = '55555555-5555-4555-8555-555555555555';

const AUTH = {
  sessionId: SESSION_ID,
  userId: USER_ID,
  provider: 'oidc',
  providerSubject: 'sub-1',
  activeTenantId: TENANT_ID,
};

function request(overrides: { auth?: unknown } = {}): Request {
  const auth = 'auth' in overrides ? overrides.auth : AUTH;
  return {
    auth: auth === undefined ? undefined : (auth as object),
    header: jest.fn(() => 'corr'),
    headers: {},
    ip: '1.2.3.4',
  } as unknown as Request;
}

function makeService(
  overrides: {
    assertPermission?: 'grant' | 'deny';
    mfa?: 'ok' | 'deny';
    mfaError?: Error;
    invitation?: {
      id?: string;
      status?: string;
      tokenHash?: string;
      tenantId?: string;
      tenantStatus?: string;
      intendedProviderSubject?: string | null;
      intendedEmailNormalized?: string | null;
      requestedRoleKeys?: string[];
      expiresAt?: Date;
    } | null;
    tenantRoleCreatesNew?: boolean;
    abuse?: AbuseControlService;
  } = {},
) {
  const mfa = {
    assertRecentMfa: jest
      .fn()
      .mockImplementation(() =>
        overrides.mfa === 'deny'
          ? Promise.reject(overrides.mfaError ?? new Error('step-up'))
          : Promise.resolve(),
      ),
  } as unknown as MfaAssuranceService;

  const auditWrite = jest.fn().mockResolvedValue({ id: 'audit-1' });
  const audit = { write: auditWrite } as unknown as AuditEventService;
  const outboxCreate = jest.fn().mockResolvedValue({ id: 'outbox-1' });
  const outbox = { create: outboxCreate } as unknown as OutboxService;

  const permissions = {
    assertTenantPermission: jest
      .fn()
      .mockImplementation(() =>
        overrides.assertPermission === 'deny'
          ? Promise.reject(new Error('denied'))
          : Promise.resolve({ membershipId: MEMBERSHIP_ID }),
      ),
  } as unknown as PermissionsService;

  const configService = {
    getOrThrow: jest
      .fn()
      .mockImplementation((key: string) =>
        key === 'INVITATION_TTL_SECONDS' ? 604800 : 900,
      ),
  } as unknown as ConfigService<ValidatedEnvironment, true>;

  const selectionTx = {
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'a' }) },
  };
  const membershipSelection = jest.fn(
    (ctx: unknown, cb: (tx: unknown) => Promise<unknown>) => cb(selectionTx),
  );

  const invitationRow =
    overrides.invitation === null
      ? null
      : {
          id: overrides.invitation?.id ?? 'inv-1',
          status: overrides.invitation?.status ?? 'PENDING',
          tokenHash: 'hash',
          tenantId: overrides.invitation?.tenantId ?? TENANT_ID,
          expiresAt:
            overrides.invitation?.expiresAt ??
            new Date(Date.now() + 86_400_000),
          intendedProviderSubject:
            overrides.invitation?.intendedProviderSubject ?? 'sub-1',
          intendedEmailNormalized:
            overrides.invitation?.intendedEmailNormalized ?? null,
          requestedRoleKeys: overrides.invitation?.requestedRoleKeys ?? [
            'tenant.admin',
          ],
          tenant: { status: overrides.invitation?.tenantStatus ?? 'ACTIVE' },
          updatedAt: new Date(),
          createdAt: new Date(),
          inviterMembershipId: MEMBERSHIP_ID,
          revokedAt: null,
          rejectedAt: null,
          acceptedAt: null,
          requestedScope: null,
        };

  const tenantTx = {
    invitation: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'inv-new', expiresAt: new Date() }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    membershipRole: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ role: { key: 'tenant.admin' } }]),
      create: jest.fn().mockResolvedValue({ id: 'mr-1' }),
    },
    role: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'role-1', key: 'tenant.admin' }]),
    },
    membership: { create: jest.fn().mockResolvedValue({ id: 'm' }) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      create: jest.fn().mockResolvedValue({ id: USER_ID }),
      update: jest.fn().mockResolvedValue({ id: USER_ID }),
    },
    externalIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'ext-1' }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'a' }) },
  };
  const tenantContext = jest.fn(
    (ctx: unknown, cb: (tx: unknown) => Promise<unknown>) => cb(tenantTx),
  );

  const prisma = {
    withMembershipSelectionContext: membershipSelection,
    withTenantContext: tenantContext,
    invitation: {
      findUnique: jest.fn().mockResolvedValue(invitationRow),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ emailNormalized: 'a@x.test' }),
    },
    $transaction: jest.fn(),
  } as unknown as PrismaService;

  const abuse =
    overrides.abuse ??
    ({
      enforceInvitation: jest.fn().mockResolvedValue({
        allowed: true,
        reason: null,
        retryAfterSeconds: null,
      }),
      enforceMfaFailure: jest.fn().mockResolvedValue({
        allowed: true,
        reason: null,
        retryAfterSeconds: null,
      }),
      emitAbuseEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as AbuseControlService);

  const service = new InvitationService(
    prisma,
    audit,
    outbox,
    permissions,
    mfa,
    configService,
    abuse,
  );
  return {
    service,
    auditWrite,
    outboxCreate,
    tenantTx,
    permissions,
    mfa,
    abuse,
    prisma,
  };
}

describe('InvitationService', () => {
  describe('create', () => {
    const createDto = {
      intendedEmail: 'new@example.com',
      requestedRoleKeys: ['tenant.admin'],
    };

    it('creates an invitation when policy and MFA pass', async () => {
      const { service, auditWrite, outboxCreate } = makeService();
      const result = await service.create(request(), createDto);
      expect(result.token).toBeDefined();
      expect(result.tenantId).toBe(TENANT_ID);
      expect(auditWrite).toHaveBeenCalledTimes(1);
      expect(
        (auditWrite.mock.calls[0][0] as { eventType: string }).eventType,
      ).toBe(AUDIT_EVENT_TYPES.MEMBERSHIP_INVITED);
      expect(outboxCreate).toHaveBeenCalledTimes(1);
    });

    it('requires an active tenant context', async () => {
      const { service } = makeService();
      await expect(
        service.create(
          request({ auth: { ...AUTH, activeTenantId: null } }),
          createDto,
        ),
      ).rejects.toBeInstanceOf(InvitationDeniedError);
    });

    it('enumerates a failed MFA step-up toward the failure limit and rethrows', async () => {
      const emitAbuseEvent = jest.fn().mockResolvedValue(undefined);
      const enforceMfaFailure = jest.fn().mockResolvedValue({
        allowed: true,
        reason: null,
        retryAfterSeconds: null,
      });
      const abuse = {
        enforceMfaFailure,
        emitAbuseEvent,
      } as unknown as AbuseControlService;

      const { service, auditWrite } = makeService({
        mfa: 'deny',
        mfaError: new MfaStepUpRequiredError('MFA_REQUIRED'),
        abuse,
      });

      await expect(service.create(request(), createDto)).rejects.toBeInstanceOf(
        MfaStepUpRequiredError,
      );

      expect(enforceMfaFailure).toHaveBeenCalledWith(SESSION_ID);
      expect(emitAbuseEvent).not.toHaveBeenCalled();
      expect(auditWrite).not.toHaveBeenCalled();
    });

    it('rejects with AbuseLimitReachedError once the failed-MFA limit is reached and emits the abuse event', async () => {
      const emitAbuseEvent = jest.fn().mockResolvedValue(undefined);
      const enforceMfaFailure = jest.fn().mockResolvedValue({
        allowed: false,
        reason: 'MFA_RATE_LIMITED',
        retryAfterSeconds: 900,
      });
      const abuse = {
        enforceMfaFailure,
        emitAbuseEvent,
      } as unknown as AbuseControlService;

      const { service, auditWrite } = makeService({
        mfa: 'deny',
        mfaError: new MfaStepUpRequiredError('MFA_REQUIRED'),
        abuse,
      });

      await expect(service.create(request(), createDto)).rejects.toBeInstanceOf(
        AbuseLimitReachedError,
      );

      expect(enforceMfaFailure).toHaveBeenCalledWith(SESSION_ID);
      expect(emitAbuseEvent).toHaveBeenCalledWith(
        expect.anything(),
        MFA_RATE_LIMITED,
        { actorUserId: USER_ID, tenantId: TENANT_ID },
      );
      expect(auditWrite).not.toHaveBeenCalled();
    });
  });

  describe('accept', () => {
    it('accepts a valid pending invitation and activates the membership', async () => {
      const { service, auditWrite } = makeService({
        invitation: { intendedProviderSubject: 'sub-1' },
      });
      const result = await service.accept(request(), { token: 'opaque-token' });
      expect(result.status).toBe('ACTIVE');
      expect(result.tenantId).toBe(TENANT_ID);
      expect(auditWrite).toHaveBeenCalledTimes(2);
      expect(
        (auditWrite.mock.calls[0][0] as { eventType: string }).eventType,
      ).toBe(AUDIT_EVENT_TYPES.ROLE_ASSIGNED);
      expect(
        (auditWrite.mock.calls[0][0] as { metadata: { roleKey: string } })
          .metadata,
      ).toEqual({ roleKey: 'tenant.admin' });
      expect(
        (auditWrite.mock.calls[1][0] as { eventType: string }).eventType,
      ).toBe(AUDIT_EVENT_TYPES.MEMBERSHIP_ACCEPTED);
    });

    it('rejects when the invitation does not exist', async () => {
      const { service } = makeService({ invitation: null });
      await expect(
        service.accept(request(), { token: 'opaque-token' }),
      ).rejects.toBeInstanceOf(InvitationDeniedError);
    });

    it('rejects on expired invitation', async () => {
      const { service } = makeService({
        invitation: { expiresAt: new Date(Date.now() - 1) },
      });
      await expect(
        service.accept(request(), { token: 'opaque-token' }),
      ).rejects.toBeInstanceOf(InvitationDeniedError);
    });

    it('rejects an identity mismatch without consuming the invitation', async () => {
      const { service } = makeService({
        invitation: { intendedProviderSubject: 'different-subject' },
      });
      await expect(
        service.accept(request(), { token: 'opaque-token' }),
      ).rejects.toBeInstanceOf(InvitationDeniedError);
    });

    it('denies acceptance when the invitation rate limit is reached and emits an abuse event', async () => {
      const emitAbuseEvent = jest.fn().mockResolvedValue(undefined);
      const abuse = {
        enforceInvitation: jest.fn().mockResolvedValue({
          allowed: false,
          reason: 'INVITATION_RATE_LIMITED',
          retryAfterSeconds: 3600,
        }),
        emitAbuseEvent,
      } as unknown as AbuseControlService;

      const { service, auditWrite } = makeService({ abuse });

      await expect(
        service.accept(request(), { token: 'opaque-token' }),
      ).rejects.toBeInstanceOf(InvitationDeniedError);

      expect(abuse.enforceInvitation).toHaveBeenCalledTimes(1);
      expect(emitAbuseEvent).toHaveBeenCalledWith(
        expect.anything(),
        'INVITATION_RATE_LIMITED',
        { actorUserId: USER_ID },
      );
      expect(auditWrite).toHaveBeenCalledTimes(0);
    });
  });
});
