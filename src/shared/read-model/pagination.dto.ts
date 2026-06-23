import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { PaginationOptions } from "./page";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @IsString()
  sort?: string;
}

export interface SortSelection {
  field: string;
  direction: "ASC" | "DESC";
}

export function hasPaginationQuery(
  query: PaginationQueryDto & { search?: string },
): boolean {
  return (
    query.page !== undefined ||
    query.limit !== undefined ||
    query.sort !== undefined
  );
}

export function normalizePagination(
  query: PaginationQueryDto = {},
  extras: Pick<PaginationOptions, "search"> = {},
): PaginationOptions {
  return {
    page: query.page ?? DEFAULT_PAGE,
    limit: query.limit ?? DEFAULT_LIMIT,
    sort: query.sort,
    search: normalizeSearch(extras.search),
  };
}

export function normalizeSearch(search: string | undefined): string | undefined {
  const trimmed = search?.trim();
  return trimmed ? trimmed : undefined;
}

export function offsetFor(options: PaginationOptions): number {
  return (options.page - 1) * options.limit;
}

export function parseSort(
  sort: string | undefined,
  allowedFields: readonly string[],
  fallback: SortSelection,
): SortSelection {
  if (!sort) return fallback;
  const [field, rawDirection] = sort.split(":");
  if (!allowedFields.includes(field)) return fallback;
  const direction = rawDirection?.toLowerCase() === "asc" ? "ASC" : "DESC";
  return { field, direction };
}
