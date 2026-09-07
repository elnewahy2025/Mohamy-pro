import { KeycloakAdminService } from './keycloak-admin.service';
import {
  ProvisioningFailedError,
  ProvisioningUnavailableError,
} from './provisioning.errors';

function config(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

function response(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: () => Promise.resolve(body),
  };
}

const ISSUER = 'https://keycloak.example/realms/mohamy';

describe('KeycloakAdminService', () => {
  it('fails closed when admin credentials are unset', async () => {
    const service = new KeycloakAdminService(
      config({}) as never,
      (async () => {
        throw new Error('must not call');
      }) as never,
    );

    await expect(
      service.createUser({
        email: 'a@example.com',
        username: 'a',
        password: 'long-enough-password',
        temporary: true,
      }),
    ).rejects.toBeInstanceOf(ProvisioningUnavailableError);
  });

  it('creates the user, sets the password, and never returns it', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const http = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (String(url).endsWith('/protocol/openid-connect/token')) {
        return response(200, { access_token: 'admin-token' });
      }
      if (String(url).endsWith('/users')) {
        return response(
          201,
          {},
          { location: '/admin/realms/mohamy/users/user-9' },
        );
      }
      return response(204, {});
    }) as never;
    const service = new KeycloakAdminService(
      config({
        OIDC_ISSUER: ISSUER,
        KEYCLOAK_ADMIN_CLIENT_ID: 'admin-cli',
        KEYCLOAK_ADMIN_CLIENT_SECRET: 'secret',
      }) as never,
      http,
    );

    const created = await service.createUser({
      email: 'a@example.com',
      username: 'a',
      password: 'long-enough-password',
      temporary: true,
    });

    expect(created).toEqual({ id: 'user-9' });
    const byUrl = (suffix: string) =>
      String(
        calls.find((call) => String(call.url).endsWith(suffix))?.init?.body ??
          '',
      );
    expect(byUrl('/protocol/openid-connect/token')).not.toContain(
      'long-enough-password',
    );
    expect(byUrl('/users')).not.toContain('long-enough-password');
    const passwordCall = calls.find((call) =>
      String(call.url).endsWith('/reset-password'),
    );
    expect(JSON.parse(String(passwordCall?.init?.body))).toEqual({
      type: 'password',
      value: 'long-enough-password',
      temporary: true,
    });
  });

  it('compensates the provider user when password setup fails', async () => {
    const deleted: string[] = [];
    const http = (async (url: string, init?: RequestInit) => {
      const urlString = String(url);
      if (urlString.endsWith('/protocol/openid-connect/token')) {
        return response(200, { access_token: 'admin-token' });
      }
      if (urlString.endsWith('/users')) {
        return response(201, {}, { location: '/users/user-9' });
      }
      if (urlString.endsWith('/reset-password')) {
        return response(400, {});
      }
      if (init?.method === 'DELETE') {
        deleted.push(urlString);
        return response(204, {});
      }
      return response(500, {});
    }) as never;
    const service = new KeycloakAdminService(
      config({
        OIDC_ISSUER: ISSUER,
        KEYCLOAK_ADMIN_CLIENT_ID: 'admin-cli',
        KEYCLOAK_ADMIN_CLIENT_SECRET: 'secret',
      }) as never,
      http,
    );

    await expect(
      service.createUser({
        email: 'a@example.com',
        username: 'a',
        password: 'long-enough-password',
        temporary: true,
      }),
    ).rejects.toBeInstanceOf(ProvisioningFailedError);
    expect(deleted).toHaveLength(1);
  });
});
