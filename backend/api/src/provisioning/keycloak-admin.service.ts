import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../config/env.validation';
import {
  ProvisioningFailedError,
  ProvisioningUnavailableError,
} from './provisioning.errors';

export interface KeycloakUserInput {
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  password: string;
  temporary: boolean;
}

type FetchImpl = typeof fetch;

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);

  constructor(
    private readonly configService: ConfigService<ValidatedEnvironment, true>,
    private readonly http: FetchImpl = fetch,
  ) {}

  private settings(): {
    base: string;
    realm: string;
    clientId: string;
    clientSecret: string;
  } {
    const reader = this.configService as unknown as {
      get(key: string): string | undefined;
    };
    const issuer = reader.get('OIDC_ISSUER');
    const clientId = reader.get('KEYCLOAK_ADMIN_CLIENT_ID');
    const clientSecret = reader.get('KEYCLOAK_ADMIN_CLIENT_SECRET');
    if (!issuer || !clientId || !clientSecret) {
      throw new ProvisioningUnavailableError();
    }
    const url = new URL(issuer);
    const match = url.pathname.match(/\/realms\/([^/]+)\/?$/);
    if (!match) throw new ProvisioningUnavailableError();
    return { base: url.origin, realm: match[1], clientId, clientSecret };
  }

  private async adminToken(settings: {
    base: string;
    realm: string;
    clientId: string;
    clientSecret: string;
  }): Promise<string> {
    const response = await this.http(
      `${settings.base}/realms/${settings.realm}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
        }).toString(),
      },
    );
    if (!response.ok) {
      this.logger.warn({
        message: 'Keycloak admin token request failed',
        status: response.status,
      });
      throw new ProvisioningFailedError(
        'Identity provider refused admin credentials',
      );
    }
    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token) {
      throw new ProvisioningFailedError(
        'Identity provider returned no admin token',
      );
    }
    return body.access_token;
  }

  async createUser(input: KeycloakUserInput): Promise<{ id: string }> {
    const settings = this.settings();
    const token = await this.adminToken(settings);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const create = await this.http(
      `${settings.base}/admin/realms/${settings.realm}/users`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          username: input.username,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          enabled: true,
          emailVerified: false,
        }),
      },
    );
    if (create.status !== 201) {
      this.logger.warn({
        message: 'Keycloak user creation failed',
        status: create.status,
      });
      throw new ProvisioningFailedError(
        'Identity provider refused user creation',
      );
    }
    const location = create.headers.get('location') ?? '';
    const id = location.split('/').filter(Boolean).pop();
    if (!id) {
      throw new ProvisioningFailedError(
        'Identity provider returned no user id',
      );
    }
    const password = await this.http(
      `${settings.base}/admin/realms/${settings.realm}/users/${encodeURIComponent(id)}/reset-password`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          type: 'password',
          value: input.password,
          temporary: input.temporary,
        }),
      },
    );
    if (!password.ok) {
      await this.deleteUserById(settings, token, id).catch(() => undefined);
      throw new ProvisioningFailedError(
        'Identity provider refused password setup',
      );
    }
    return { id };
  }

  async deleteUser(id: string): Promise<void> {
    const settings = this.settings();
    const token = await this.adminToken(settings);
    await this.deleteUserById(settings, token, id);
  }

  private async deleteUserById(
    settings: { base: string; realm: string },
    token: string,
    id: string,
  ): Promise<void> {
    await this.http(
      `${settings.base}/admin/realms/${settings.realm}/users/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  }
}
