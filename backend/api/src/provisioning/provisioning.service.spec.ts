import { ProvisioningService } from './provisioning.service';
import { ProvisioningDeniedError } from './provisioning.errors';

describe('ProvisioningService', () => {
  function setup() {
    const permissions = {
      assertTenantPermission: jest
        .fn()
        .mockResolvedValue({ membershipId: 'm1' }),
    };
    const keycloak = {
      createUser: jest.fn().mockResolvedValue({ id: 'sub-9' }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    };
    const invitations = { create: jest.fn() };
    const audit = { write: jest.fn().mockResolvedValue({ id: 'e1' }) };
    const svc = new ProvisioningService(
      permissions as never,
      invitations as never,
      keycloak as never,
      audit as never,
    );
    return { permissions, keycloak, invitations, audit, svc };
  }

  const request = (overrides = {}) =>
    ({
      auth: { userId: 'u1', activeTenantId: 't1', sessionId: 's1' },
      headers: {},
      header: () => undefined,
      ...overrides,
    }) as never;

  const dto = {
    email: 'new.member@example.com',
    password: 'long-enough-password',
    roleKeys: ['tenant.admin'],
  } as never;

  it('provisions provider user then invitation, in that order', async () => {
    const { keycloak, invitations, audit, svc } = setup();
    invitations.create.mockImplementation(() => {
      expect(keycloak.createUser).toHaveBeenCalledTimes(1);
      return Promise.resolve({
        invitationId: 'i1',
        expiresAt: new Date('2026-01-02T00:00:00.000Z'),
      });
    });

    const result = await svc.provision(request(), dto);

    expect(result).toEqual({
      providerSubject: 'sub-9',
      invitationId: 'i1',
      expiresAt: '2026-01-02T00:00:00.000Z',
    });
    expect(invitations.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        intendedEmail: 'new.member@example.com',
        intendedProviderSubject: 'sub-9',
        requestedRoleKeys: ['tenant.admin'],
      }),
    );
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'user.provisioned' }),
    );
    expect(keycloak.deleteUser).not.toHaveBeenCalled();
  });

  it('deletes the provider user when invitation creation fails', async () => {
    const { keycloak, invitations, svc } = setup();
    invitations.create.mockRejectedValue(new Error('invitation failed'));

    await expect(svc.provision(request(), dto)).rejects.toThrow(
      'invitation failed',
    );
    expect(keycloak.deleteUser).toHaveBeenCalledWith('sub-9');
  });

  it('denies unauthenticated and tenant-less callers', async () => {
    const { svc } = setup();

    await expect(
      svc.provision(request({ auth: null }), dto),
    ).rejects.toBeInstanceOf(ProvisioningDeniedError);
    await expect(
      svc.provision(request({ auth: { userId: 'u1', sessionId: 's1' } }), dto),
    ).rejects.toBeInstanceOf(ProvisioningDeniedError);
  });
});
