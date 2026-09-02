import type { Request } from 'express';
import { AuditEventService } from '../../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../../audit/audit-constants';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { PermissionsService } from '../../permissions/permissions.service';
import { OrganizationConfigDeniedError } from '../organization-config.errors';
import { OrganizationSettingsService } from './settings.service';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_MEMBERSHIP = '55555555-5555-4555-8555-555555555555';
const SETTING_ID = '66666666-6666-4666-8666-666666666666';

const AUTH = {
  sessionId: SESSION_ID,
  userId: USER_ID,
  provider: 'oidc',
  providerSubject: 'sub',
  activeTenantId: TENANT_ID,
};

function request(): Request {
  return {
    auth: AUTH as object,
    header: jest.fn(() => 'corr'),
    headers: {},
    ip: '1.2.3.4',
  } as unknown as Request;
}

function makeService(
  overrides: {
    existingVersion?: number | null;
    permissionAllowed?: boolean;
  } = {},
) {
  const permissions =
    overrides.permissionAllowed === false
      ? {
          assertTenantPermission: jest
            .fn()
            .mockRejectedValue(
              new OrganizationConfigDeniedError('MISSING_PERMISSION'),
            ),
        }
      : {
          assertTenantPermission: jest
            .fn()
            .mockResolvedValue({ membershipId: ACTOR_MEMBERSHIP }),
        };
  const permissionsService = permissions as unknown as PermissionsService;

  const auditWrite = jest.fn().mockResolvedValue({ id: 'audit-1' });
  const audit = { write: auditWrite } as unknown as AuditEventService;

  const findUnique = jest
    .fn()
    .mockResolvedValue(
      overrides.existingVersion === null ||
        overrides.existingVersion === undefined
        ? null
        : { id: SETTING_ID, version: overrides.existingVersion },
    );
  const upsert = jest.fn().mockResolvedValue({
    id: SETTING_ID,
    tenantId: TENANT_ID,
    key: 'catalog.case-type',
    version: (overrides.existingVersion ?? 0) + 1,
  });
  const transaction = {
    organizationSetting: { findUnique, upsert },
  };
  const withTenantContext = jest
    .fn()
    .mockImplementation((_context, cb: (tx: unknown) => unknown) =>
      cb(transaction),
    );
  const prisma = {
    withTenantContext,
  } as unknown as PrismaService;

  const service = new OrganizationSettingsService(
    prisma,
    audit,
    permissionsService,
  );
  return { service, findUnique, upsert, auditWrite, withTenantContext };
}

describe('OrganizationSettingsService', () => {
  it('creates a setting when none exists', async () => {
    const { service, findUnique, upsert } = makeService({
      existingVersion: null,
    });
    const result = await service.set(request(), {
      key: 'catalog.case-type',
      value: { label: 'Labour' },
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_key: { tenantId: TENANT_ID, key: 'catalog.case-type' },
      },
      select: { id: true, version: true },
    });
    expect(upsert).toHaveBeenCalled();
    expect(result).toMatchObject({
      tenantId: TENANT_ID,
      key: 'catalog.case-type',
      version: 1,
      created: true,
    });
  });

  it('bumps version on update of an existing setting', async () => {
    const { service } = makeService({ existingVersion: 3 });
    const result = await service.set(request(), {
      key: 'catalog.case-type',
      value: { label: 'Commercial' },
    });
    expect(result).toMatchObject({ version: 4, created: false });
  });

  it('emits the audit event transactionally', async () => {
    const { service, auditWrite, withTenantContext } = makeService({
      existingVersion: null,
    });
    await service.set(request(), {
      key: 'branding.primary-color',
      value: { color: '#1249a6' },
    });
    const emitted = auditWrite.mock.calls[0];
    expect(emitted[0].eventType).toBe(
      AUDIT_EVENT_TYPES.ORGANIZATION_SETTING_SET,
    );
    expect(emitted[0].tenantId).toBe(TENANT_ID);
    expect(emitted[0].metadata).toMatchObject({
      key: 'branding.primary-color',
      version: 1,
    });
    const txPassed = withTenantContext.mock.calls[0][0];
    expect(txPassed).toMatchObject({
      tenantId: TENANT_ID,
      userId: USER_ID,
      membershipId: ACTOR_MEMBERSHIP,
    });
  });

  it('rejects an unauthenticated request without touching the store', async () => {
    const { service, upsert } = makeService({ existingVersion: null });
    const req = request();
    delete (req as { auth?: unknown }).auth;
    await expect(
      service.set(req, { key: 'k', value: 1 }),
    ).rejects.toBeInstanceOf(OrganizationConfigDeniedError);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects a request without a tenant context', async () => {
    const { service, upsert } = makeService({ existingVersion: null });
    const req = request();
    req.auth = {
      ...(req.auth as object),
      activeTenantId: null,
    } as Request['auth'];
    await expect(
      service.set(req, { key: 'k', value: 1 }),
    ).rejects.toBeInstanceOf(OrganizationConfigDeniedError);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects when the caller lacks the permission', async () => {
    const { service } = makeService({
      existingVersion: null,
      permissionAllowed: false,
    });
    await expect(
      service.set(request(), { key: 'k', value: 1 }),
    ).rejects.toBeInstanceOf(OrganizationConfigDeniedError);
  });
});
