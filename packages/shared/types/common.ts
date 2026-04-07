export type UUID = string;

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  limit?: number;
  sort?: string;
}

export function parsePagination(params: PaginationParams) {
  const page = Math.max(1, params.page ?? 1);
  const rawPageSize = params.pageSize ?? params.limit ?? 20;
  const pageSize = Math.min(100, Math.max(1, rawPageSize));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, limit: pageSize, offset };
}
