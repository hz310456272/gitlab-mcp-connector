export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;

export interface PaginationParams {
  page?: number;
  perPage?: number;
}

export function normalizePagination(params?: PaginationParams): {
  page: number;
  per_page: number;
} {
  const page = Math.max(1, params?.page ?? 1);
  let perPage = params?.perPage ?? DEFAULT_PER_PAGE;
  perPage = Math.max(1, Math.min(perPage, MAX_PER_PAGE));
  return { page, per_page: perPage };
}

export function extractPaginationParams(
  record: Record<string, unknown>,
): PaginationParams {
  const result: PaginationParams = {};
  if (typeof record.page === "number") result.page = record.page;
  if (typeof record.perPage === "number") result.perPage = record.perPage;
  return result;
}
