import * as fs from "fs";
import * as path from "path";

export const FORBIDDEN_PRODUCTS_DML_MESSAGE =
  "migration contains forbidden DML against products table";
export const FORBIDDEN_USERS_DML_MESSAGE =
  "migration contains forbidden DML against users table";
export const FORBIDDEN_SALE_BACKFILL_MESSAGE =
  "migration contains forbidden DML: sale manual-discount backfill";
const PRODUCT_USER_DML_REGEX =
  /\b(insert\s+into|update|delete\s+from)\s+(?:public\.)?["`]?(products|users)\b["`]?/gi;
const SALE_MANUAL_DISCOUNT_BACKFILL_REGEX =
  /\bupdate\s+(?:public\.)?["`]?sales["`]?\s+set\b[^;]*(manual_discount_amount|manual_discount_modality|manual_discount_percentage)\b/i;
// Pre-existing migration that only performs self-contained idempotent product
// seeding and a scoped DELETE of its own rows; never mutates live product/user data.
const PRESERVED_SEED_MIGRATION_FILES = new Set([
  "1802000000000-AddSpecialProductCodes.ts",
]);
export interface MigrationSourceFile {
  fileName: string;
  source: string;
}
export function stripComments(source: string): string {
  return source.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}
export function normalizeSql(source: string): string {
  return stripComments(source).replace(/\s+/g, " ");
}
export function detectForbiddenProductUserDml(normalizedSql: string): string[] {
  return [
    ...new Set(
      [...normalizedSql.matchAll(PRODUCT_USER_DML_REGEX)].map((match) =>
        match[2].toLowerCase() === "products"
          ? FORBIDDEN_PRODUCTS_DML_MESSAGE
          : FORBIDDEN_USERS_DML_MESSAGE,
      ),
    ),
  ];
}
export function detectForbiddenSaleBackfill(normalizedSql: string): string[] {
  return SALE_MANUAL_DISCOUNT_BACKFILL_REGEX.test(normalizedSql)
    ? [FORBIDDEN_SALE_BACKFILL_MESSAGE]
    : [];
}
export function readMigrationSourceFiles(
  migrationsDir: string,
): MigrationSourceFile[] {
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".spec.ts"))
    .sort()
    .map((name) => ({
      fileName: name,
      source: fs.readFileSync(path.join(migrationsDir, name), "utf8"),
    }));
}
export function analyzeMigrationFile(file: MigrationSourceFile): string[] {
  const sql = normalizeSql(file.source);
  const violations: string[] = [];
  if (!PRESERVED_SEED_MIGRATION_FILES.has(file.fileName)) {
    violations.push(...detectForbiddenProductUserDml(sql));
  }
  violations.push(...detectForbiddenSaleBackfill(sql));
  return [...new Set(violations)];
}
