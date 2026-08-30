import type { Request } from 'express';
import { TenantSwitchController } from './tenant-switch.controller';
import type { TenantSwitchService } from './tenant-switch.service';

describe('TenantSwitchController', () => {
  it('delegates to the service with the requested tenant id', async () => {
    const result = {
      tenantId: 'tenant-1',
      slug: 'acme',
      name: 'Acme',
      membershipId: 'member-1',
    };
    const switchTenant = jest.fn().mockResolvedValue(result);
    const controller = new TenantSwitchController({
      switchTenant,
    } as unknown as TenantSwitchService);

    const req = { auth: { userId: 'u1' } } as unknown as Request;
    const actual = await controller.switchTenant(req, { tenantId: 'tenant-1' });

    expect(actual).toEqual(result);
    expect(switchTenant).toHaveBeenCalledWith(req, 'tenant-1');
  });
});
