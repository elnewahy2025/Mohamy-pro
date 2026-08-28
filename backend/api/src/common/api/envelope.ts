export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface ApiSuccessEnvelope<T = unknown> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
    pagination: PaginationMeta | null;
  };
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

export function isPaginatedShape(value: unknown): value is Paginated<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'pagination' in value &&
    typeof (value as Paginated<unknown>).pagination?.total === 'number'
  );
}
