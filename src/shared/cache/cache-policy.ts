export interface CachePolicy {
  prefix: string;
  ttlMs: number;
  cacheable: boolean;
}

export const PRODUCT_READ_CACHE_POLICY: CachePolicy = {
  prefix: "products:v1",
  ttlMs: 30_000,
  cacheable: true,
};

export const REPORT_READ_CACHE_POLICY: CachePolicy = {
  prefix: "reports:v1",
  ttlMs: 60_000,
  cacheable: true,
};

export const DISABLED_CACHE_POLICY: CachePolicy = {
  prefix: "disabled:v1",
  ttlMs: 0,
  cacheable: false,
};
