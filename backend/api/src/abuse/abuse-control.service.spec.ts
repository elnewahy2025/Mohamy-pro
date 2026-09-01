import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../config/env.validation';
import { AuditEventService } from '../audit/audit-event.service';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { ACCOUNT_LOCKED } from './abuse-control.constants';
import { AbuseCounterService } from './abuse-counter.service';
import { AbuseControlService } from './abuse-control.service';

const IDENTIFIER = 'provider-subject-1';

function request(): Request {
  return {
    header: jest.fn(() => 'corr'),
    headers: {},
    ip: '1.2.3.4',
  } as unknown as Request;
}

function makeService(overrides: {
  markerPresent?: boolean;
  auditWrite?: jest.Mock;
}) {
  const hasMarker = jest
    .fn()
    .mockResolvedValue(overrides.markerPresent ?? false);
  const clearMarker = jest.fn().mockResolvedValue(true);
  const counter = {
    hasMarker,
    clearMarker,
  } as unknown as AbuseCounterService;

  const auditWrite =
    overrides.auditWrite ?? jest.fn().mockResolvedValue({ id: 'audit-1' });
  const audit = { write: auditWrite } as unknown as AuditEventService;

  const config = {
    get: jest.fn(() => undefined),
  } as unknown as ConfigService<ValidatedEnvironment, true>;

  const service = new AbuseControlService(counter, audit, config);
  return { service, hasMarker, clearMarker, auditWrite };
}

describe('AbuseControlService.releaseLockout', () => {
  it('returns without clearing or auditing when no lockout marker exists', async () => {
    const { service, clearMarker, auditWrite } = makeService({
      markerPresent: false,
    });

    await service.releaseLockout(request(), IDENTIFIER);

    expect(clearMarker).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it('clears the marker and emits ACCOUNT_LOCK_RELEASED when a marker exists', async () => {
    const { service, clearMarker, auditWrite } = makeService({
      markerPresent: true,
    });

    await service.releaseLockout(request(), IDENTIFIER);

    expect(clearMarker).toHaveBeenCalledTimes(1);
    const write = auditWrite.mock.calls[0][0] as {
      eventType: string;
      outcome: string;
      targetType: string;
      targetId: string;
      reasonCode: string;
    };
    expect(write.eventType).toBe(AUDIT_EVENT_TYPES.ACCOUNT_LOCK_RELEASED);
    expect(write.outcome).toBe('SUCCEEDED');
    expect(write.targetType).toBe('account');
    expect(write.targetId).toBe(IDENTIFIER);
    expect(write.reasonCode).toBe(ACCOUNT_LOCKED);
  });

  it('swallows an audit write failure on a successful login (never throws)', async () => {
    const { service, clearMarker } = makeService({
      markerPresent: true,
      auditWrite: jest.fn().mockRejectedValue(new Error('audit down')),
    });

    await expect(
      service.releaseLockout(request(), IDENTIFIER),
    ).resolves.toBeUndefined();
    expect(clearMarker).toHaveBeenCalledTimes(1);
  });
});
