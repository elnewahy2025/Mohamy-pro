import type { Request } from 'express';
import { BootstrapController } from './bootstrap.controller';
import type { BootstrapService } from './bootstrap.service';

describe('BootstrapController', () => {
  it('delegates to the service with the provided secret', async () => {
    const result = {
      tenantId: 'tenant-1',
      slug: 'acme',
      name: 'Acme',
      organizationId: 'org-1',
      membershipId: 'member-1',
    };
    const bootstrap = jest.fn().mockResolvedValue(result);
    const controller = new BootstrapController({
      bootstrap,
    } as unknown as BootstrapService);

    const req = { auth: { userId: 'u1' } } as unknown as Request;
    const actual = await controller.bootstrap(req, { secret: 'topsecret' });

    expect(actual).toEqual(result);
    expect(bootstrap).toHaveBeenCalledWith(req, 'topsecret');
  });
});
