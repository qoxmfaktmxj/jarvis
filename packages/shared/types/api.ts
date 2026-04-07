export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface PaginationMeta {
  total: number;
  page: number;
  totalPages: number;
  limit?: number;
  pageSize?: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

export type PaginatedResponse<T> = ApiResponse<T[]> & { meta: PaginationMeta };

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export function apiOk<T>(data: T, meta?: PaginationMeta): ApiResponse<T> {
  return { data, ...(meta ? { meta } : {}) };
}

export function apiError(
  code: ErrorCode,
  message: string,
  details?: unknown
): ApiError {
  return { error: { code, message, ...(details ? { details } : {}) } };
}
