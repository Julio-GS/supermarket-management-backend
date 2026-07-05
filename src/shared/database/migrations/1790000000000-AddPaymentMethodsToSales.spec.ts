import { QueryRunner } from "typeorm";
import { AddPaymentMethodsToSales1790000000000 } from "./1790000000000-AddPaymentMethodsToSales";

describe("AddPaymentMethodsToSales1790000000000", () => {
  it("creates sale_payment_methods without backfilling existing sales", async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;
    const migration = new AddPaymentMethodsToSales1790000000000();

    await migration.up(queryRunner);

    const sqlStatements = (queryRunner.query as jest.Mock).mock.calls.map(
      ([sql]) => sql as string,
    );

    expect(sqlStatements).toHaveLength(2);
    expect(sqlStatements[0]).toContain(
      "CREATE TABLE IF NOT EXISTS sale_payment_methods",
    );
    expect(sqlStatements[1]).toContain(
      "CREATE INDEX IF NOT EXISTS idx_sale_payment_methods_sale_id",
    );
    expect(sqlStatements.join("\n")).not.toMatch(/\bINSERT\b/i);
    expect(sqlStatements.join("\n")).not.toMatch(/\bUPDATE\b/i);
  });

  it("drops sale_payment_methods on rollback", async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;
    const migration = new AddPaymentMethodsToSales1790000000000();

    await migration.down(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("DROP TABLE IF EXISTS sale_payment_methods"),
    );
  });
});
