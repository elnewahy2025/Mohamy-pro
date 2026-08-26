import { BadRequestException } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { createSuccessEnvelope } from './api-envelope';
import { Phase2BusinessInterceptor } from './phase2-business.interceptor';

const KEY = '11111111-1111-4111-8111-111111111111';
const CORRELATION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_ID = '44444444-4444-4444-8444-444444444444';
const MEMBERSHIP_ID = '55555555-5555-4555-8555-555555555555';

function createRequest(overrides: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {
    'idempotency-key': KEY,
    'x-correlation-id': CORRELATION_ID,
  };
  const request = {
    method: 'POST',
    originalUrl: '/api/v1/session/tenant-switch',
    body: { tenantId: TENANT_ID },
    authSession: {
      userId: USER_ID,
      activeTenantId: null,
      activeMembershipId: null,
    },
    header(name: string) {
      return headers[name.toLowerCase()];
    },
    ...overrides,
  };
  return request;
}

function createContext(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as never;
}

describe('Phase2BusinessInterceptor', () => {
  it('reserves, wraps, and completes a global business mutation', async () => {
    const request = createRequest();
    const response = {
      setHeader: jest.fn(),
      status: jest.fn(),
      json: jest.fn(),
    };
    const idempotency = {
      register: jest.fn().mockResolvedValue({ kind: 'RESERVED', record: {} }),
      complete: jest.fn().mockResolvedValue({}),
      releaseForRetry: jest.fn(),
    };
    const next = { handle: jest.fn().mockReturnValue(of({ switched: true })) };
    const interceptor = new Phase2BusinessInterceptor(idempotency as never);

    const stream = await interceptor.intercept(
      createContext(request, response),
      next as never,
    );
    await expect(firstValueFrom(stream)).resolves.toEqual(
      expect.objectContaining({ success: true, data: { switched: true } }),
    );

    expect(idempotency.register).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ key: KEY, method: 'POST' }),
        scope: {
          kind: 'GLOBAL',
          actorScope: USER_ID,
          operationId: expect.any(String),
        },
      }),
    );
    expect(idempotency.complete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'GLOBAL' }),
      expect.objectContaining({
        responseStatus: 200,
        responseBody: expect.objectContaining({ success: true }),
      }),
    );
  });

  it('uses a stable global scope for a context-changing tenant switch', async () => {
    const request = createRequest({
      authSession: {
        userId: USER_ID,
        activeTenantId: TENANT_ID,
        activeMembershipId: MEMBERSHIP_ID,
      },
    });
    const idempotency = {
      register: jest.fn().mockResolvedValue({ kind: 'RESERVED', record: {} }),
      complete: jest.fn().mockResolvedValue({}),
    };
    const interceptor = new Phase2BusinessInterceptor(idempotency as never);

    const stream = await interceptor.intercept(createContext(request, {}), {
      handle: () => of({ ok: true }),
    } as never);
    await firstValueFrom(stream);

    expect(idempotency.register).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: {
          kind: 'GLOBAL',
          actorScope: USER_ID,
          operationId: expect.any(String),
        },
      }),
    );
  });

  it('uses a stable global scope for invitation acceptance across tenant contexts', async () => {
    const request = createRequest({
      originalUrl: '/api/v1/invitations/accept',
      body: { token: 'a'.repeat(43) },
      authSession: {
        userId: USER_ID,
        activeTenantId: TENANT_ID,
        activeMembershipId: MEMBERSHIP_ID,
      },
    });
    const idempotency = {
      register: jest.fn().mockResolvedValue({ kind: 'RESERVED', record: {} }),
      complete: jest.fn().mockResolvedValue({}),
    };
    const interceptor = new Phase2BusinessInterceptor(idempotency as never);

    const stream = await interceptor.intercept(createContext(request, {}), {
      handle: () => of({ accepted: true }),
    } as never);
    await firstValueFrom(stream);

    expect(idempotency.register).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: {
          kind: 'GLOBAL',
          actorScope: USER_ID,
          operationId: expect.any(String),
        },
      }),
    );
  });

  it('does not persist the raw invitation token in the idempotency replay', async () => {
    const request = createRequest({
      originalUrl: `/api/v1/tenants/${TENANT_ID}/invitations`,
      body: { requestedRoleKeys: ['lawyer'] },
    });
    const idempotency = {
      register: jest.fn().mockResolvedValue({ kind: 'RESERVED', record: {} }),
      complete: jest.fn().mockResolvedValue({}),
    };
    const interceptor = new Phase2BusinessInterceptor(idempotency as never);
    const stream = await interceptor.intercept(createContext(request, {}), {
      handle: () =>
        of({
          invitationId: '66666666-6666-4666-8666-666666666666',
          invitationToken: 'raw-one-time-token',
          expiresAt: '2026-08-29T00:00:00.000Z',
        }),
    } as never);

    const firstResponse = await firstValueFrom(stream);
    expect(firstResponse).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          invitationToken: 'raw-one-time-token',
        }),
      }),
    );
    const completion = idempotency.complete.mock.calls[0][2];
    expect(completion.responseBody.data).toEqual(
      expect.objectContaining({
        invitationId: '66666666-6666-4666-8666-666666666666',
      }),
    );
    expect(completion.responseBody.data).not.toHaveProperty('invitationToken');
  });

  it('returns the stored body for an exact replay without invoking the handler', async () => {
    const request = createRequest();
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    };
    const storedBody = createSuccessEnvelope(
      { switched: true },
      request as never,
    );
    const idempotency = {
      register: jest.fn().mockResolvedValue({
        kind: 'REPLAY',
        record: {
          responseStatus: 200,
          responseBody: storedBody,
          responseHeaders: { 'x-correlation-id': CORRELATION_ID },
        },
      }),
    };
    const next = { handle: jest.fn() };
    const interceptor = new Phase2BusinessInterceptor(idempotency as never);

    const stream = await interceptor.intercept(
      createContext(request, response),
      next as never,
    );

    expect(next.handle).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(storedBody);
    await expect(firstValueFrom(stream)).rejects.toBeDefined();
  });

  it('rejects malformed idempotency keys before reservation', async () => {
    const request = createRequest();
    (request.header as (name: string) => string | undefined) = (name) =>
      name === 'idempotency-key' ? 'not-a-uuid' : CORRELATION_ID;
    const idempotency = { register: jest.fn() };
    const interceptor = new Phase2BusinessInterceptor(idempotency as never);

    await expect(
      interceptor.intercept(createContext(request, {}), {
        handle: jest.fn(),
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(idempotency.register).not.toHaveBeenCalled();
  });

  it('stores a terminal error envelope and rethrows the original controlled exception', async () => {
    const request = createRequest();
    const error = new BadRequestException('IDEMPOTENCY_KEY_INVALID');
    const idempotency = {
      register: jest.fn().mockResolvedValue({ kind: 'RESERVED', record: {} }),
      complete: jest.fn().mockResolvedValue({}),
      releaseForRetry: jest.fn(),
    };
    const interceptor = new Phase2BusinessInterceptor(idempotency as never);

    const stream = await interceptor.intercept(createContext(request, {}), {
      handle: () => throwError(() => error),
    } as never);
    await expect(firstValueFrom(stream)).rejects.toBe(error);

    expect(request.phase2ErrorEnvelope).toEqual(
      expect.objectContaining({ success: false }),
    );
    expect(idempotency.complete).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        terminalFailure: true,
        responseBody: expect.objectContaining({ success: false }),
      }),
    );
  });
});
