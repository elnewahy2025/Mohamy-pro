export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  IDEMPOTENCY_IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',
  RATE_LIMITED: 'RATE_LIMITED',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'The provided input is invalid.',
  BAD_REQUEST: 'The request is malformed.',
  UNAUTHORIZED:
    'Authentication is required or provided credentials are invalid.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  METHOD_NOT_ALLOWED: 'The HTTP method is not allowed for this resource.',
  CONFLICT: 'The request conflicts with the current state of the resource.',
  IDEMPOTENCY_CONFLICT:
    'An idempotency conflict occurred. Provide a new Idempotency-Key.',
  IDEMPOTENCY_IN_PROGRESS:
    'A request with this Idempotency-Key is already in progress. Retry shortly.',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  UNPROCESSABLE_ENTITY: 'The request could not be processed.',
  PAYLOAD_TOO_LARGE: 'The request payload is too large.',
  INTERNAL_ERROR: 'Internal server error.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable.',
};

export function codeForHttpStatus(
  status: number,
  fallback: ErrorCode,
): ErrorCode {
  if (status === 400) return ERROR_CODES.BAD_REQUEST;
  if (status === 401) return ERROR_CODES.UNAUTHORIZED;
  if (status === 403) return ERROR_CODES.FORBIDDEN;
  if (status === 404) return ERROR_CODES.NOT_FOUND;
  if (status === 405) return ERROR_CODES.METHOD_NOT_ALLOWED;
  if (status === 409) return ERROR_CODES.CONFLICT;
  if (status === 422) return ERROR_CODES.UNPROCESSABLE_ENTITY;
  if (status === 429) return ERROR_CODES.RATE_LIMITED;
  if (status === 413) return ERROR_CODES.PAYLOAD_TOO_LARGE;
  if (status === 503) return ERROR_CODES.SERVICE_UNAVAILABLE;
  if (status >= 500) return ERROR_CODES.INTERNAL_ERROR;
  return fallback;
}

export function defaultMessageForCode(code: ErrorCode): string {
  return DEFAULT_MESSAGE[code];
}
