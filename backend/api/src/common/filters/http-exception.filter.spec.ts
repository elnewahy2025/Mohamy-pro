import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { ApiError } from '../api/api-error';

function makeHost(statusCode: number, status: jest.Mock) {
  const request = {
    method: 'POST',
    originalUrl: '/api/v1/tenants/1/roles',
    header: (name: string) =>
      name.toLowerCase() === 'x-correlation-id' ? 'req-abc' : undefined,
  };
  const response = {
    status,
    json: jest.fn(),
    setHeader: jest.fn(),
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let status: jest.Mock;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('returns a stable validation-failed error envelope for validation errors', () => {
    status = jest.fn().mockReturnThis();
    const host = makeHost(HttpStatus.BAD_REQUEST, status);
    const exception = new BadRequestException(['name must not be empty']);
    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

    const response = host.switchToHttp().getResponse();
    const body = response.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toEqual(['name must not be empty']);
    expect(body.meta.requestId).toBe('req-abc');
    expect(body.meta.timestamp).toEqual(expect.any(String));
  });

  it('maps ApiError code and details into the error envelope', () => {
    status = jest.fn().mockReturnThis();
    const host = makeHost(HttpStatus.CONFLICT, status);
    const exception = ApiError.idempotencyConflict();
    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    const response = host.switchToHttp().getResponse();
    const body = response.json.mock.calls[0][0];
    expect(body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('uses a safe INTERNAL_ERROR for unknown exceptions', () => {
    status = jest.fn().mockReturnThis();
    const host = makeHost(HttpStatus.INTERNAL_SERVER_ERROR, status);
    filter.catch(new Error('db boom'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const response = host.switchToHttp().getResponse();
    const body = response.json.mock.calls[0][0];
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('db boom');
  });
});
