export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sort?: string;
  search?: string;
}

export function createPage<T>(
  data: T[],
  total: number,
  options: PaginationOptions,
): Page<T> {
  const totalPages = total === 0 ? 0 : Math.ceil(total / options.limit);
  return {
    data,
    meta: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages,
      hasNext: options.page < totalPages,
    },
  };
}

export function mapPage<T, R>(page: Page<T>, map: (item: T) => R): Page<R> {
  return {
    data: page.data.map(map),
    meta: page.meta,
  };
}
