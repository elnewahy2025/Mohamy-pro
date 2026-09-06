import type { Request } from 'express';
import { PermissionsService } from '../../permissions/permissions.service';
import { PermissionDeniedError } from '../../permissions/permission.errors';
import { PartyOperations } from '../../parties/party.operations';
import { CaseOperations } from '../../cases/case.operations';
import { WorkflowOperations } from '../../workflows/workflow.operations';
import { HearingOperations } from '../../hearings/hearing.operations';
import { BillingOperations } from '../../billing/billing.operations';
import { CommunicationsOperations } from '../../communications/communications.operations';
import { CalendarOperations } from '../../calendar/calendar.operations';
import { CaseTimelineOperations } from '../../case-timeline/case-timeline.operations';
import { DeadlineOperations } from '../../deadlines/deadline.operations';
import { TaskOperations } from '../../tasks/task.operations';
import { DocumentOperations } from '../../documents/document.operations';
import { BreakGlassOperations } from '../../breakglass/breakglass.operations';
import { RoleOperations } from '../../roles/role.operations';
import { DenialService } from '../../denials/denial.service';
import {
  requireTimeTrackingContext,
  requireTimeTrackingPermission,
} from '../../time-tracking/time-tracking-auth';
import { TIME_APPROVE_PERMISSION } from '../../time-tracking/time-tracking-auth';

function request(): Request {
  return {
    auth: { userId: 'u1', activeTenantId: 't1', sessionId: 's1' },
    headers: {},
  } as unknown as Request;
}

function permissions(allowed: boolean) {
  const assertTenantPermission = jest.fn(async () => {
    if (!allowed) {
      throw new PermissionDeniedError('CanX', 'MISSING_PERMISSION');
    }
    return { membershipId: 'mem-1' };
  });
  return {
    service: { assertTenantPermission } as unknown as PermissionsService,
    assertTenantPermission,
  };
}

const deps = () => ({
  prisma: {} as never,
  audit: {} as never,
  resourceAccess: {} as never,
});

type OpsCase = [
  string,
  (permissions: PermissionsService) => {
    authorize: (req: Request) => Promise<unknown>;
  },
];

const CASES: OpsCase[] = [
  ['party', (p) => new PartyOperations(deps().prisma, deps().audit, p)],
  [
    'case',
    (p) =>
      new CaseOperations(deps().prisma, deps().audit, p, deps().resourceAccess),
  ],
  ['workflow', (p) => new WorkflowOperations(deps().prisma, deps().audit, p)],
  ['hearing', (p) => new HearingOperations(deps().prisma, deps().audit, p)],
  ['billing', (p) => new BillingOperations(deps().prisma, deps().audit, p)],
  [
    'communications',
    (p) => new CommunicationsOperations(deps().prisma, deps().audit, p),
  ],
  ['calendar', (p) => new CalendarOperations(deps().prisma, deps().audit, p)],
  [
    'case-timeline',
    (p) => new CaseTimelineOperations(deps().prisma, deps().audit, p),
  ],
  ['deadline', (p) => new DeadlineOperations(deps().prisma, deps().audit, p)],
  ['task', (p) => new TaskOperations(deps().prisma, deps().audit, p)],
  ['document', (p) => new DocumentOperations(deps().prisma, deps().audit, p)],
  [
    'breakglass',
    (p) => new BreakGlassOperations(deps().prisma, deps().audit, p),
  ],
  ['roles', (p) => new RoleOperations(deps().prisma, deps().audit, p)],
];

describe('G8 operations authorize contract (allow + deny, no mocks of the unit under test)', () => {
  for (const [name, make] of CASES) {
    it(`authorizes and propagates denial in ${name} operations`, async () => {
      const allowed = permissions(true);
      const ops = make(allowed.service);
      const ctx = (await ops.authorize(request())) as {
        actorMembershipId: string;
      };
      expect(ctx.actorMembershipId).toBe('mem-1');
      expect(allowed.assertTenantPermission).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', tenantId: 't1' }),
      );

      const denied = permissions(false);
      const deniedOps = make(denied.service);
      await expect(deniedOps.authorize(request())).rejects.toBeInstanceOf(
        PermissionDeniedError,
      );
    });
  }

  it('time-tracking helpers gate on session and permission', async () => {
    expect(requireTimeTrackingContext(request())).toEqual({
      tenantId: 't1',
      userId: 'u1',
    });
    expect(() =>
      requireTimeTrackingContext({ headers: {} } as unknown as Request),
    ).toThrow('UNAUTHENTICATED');

    const allowed = permissions(true);
    await expect(
      requireTimeTrackingPermission(
        request(),
        allowed.service,
        TIME_APPROVE_PERMISSION,
      ),
    ).resolves.toEqual({ tenantId: 't1', userId: 'u1' });
    const denied = permissions(false);
    await expect(
      requireTimeTrackingPermission(
        request(),
        denied.service,
        TIME_APPROVE_PERMISSION,
      ),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('denial service validates before touching the database', async () => {
    const tx = { accessDenial: { create: jest.fn() } };
    const service = new DenialService();
    await expect(
      service.createDenial(tx as never, 't1', 'mgr1', {
        permissionKey: 'Nope',
        reason: 'x',
      } as never),
    ).rejects.toThrow('Unknown permission key');
    expect(tx.accessDenial.create).not.toHaveBeenCalled();
  });
});
