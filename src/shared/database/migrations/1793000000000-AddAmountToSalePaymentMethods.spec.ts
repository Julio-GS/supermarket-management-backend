import { QueryRunner } from "typeorm";
import { AddAmountToSalePaymentMethods1793000000000 } from "./1793000000000-AddAmountToSalePaymentMethods";

describe("AddAmountToSalePaymentMethods1793000000000", () => {
  it("adds amount column to sale_payment_methods with default 0.00", async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;
    const migration = new AddAmountToSalePaymentMethods1793000000000();

    await migration.up(queryRunner);

    const sqlStatements = (queryRunner.query as jest.Mock).mock.calls.map(
      ([sql]) => sql as string,
    );

    expect(sqlStatements).toHaveLength(1);
    expect(sqlStatements[0]).toContain(
      "ALTER TABLE sale_payment_methods",
    );
    expect(sqlStatements[0]).toContain("ADD COLUMN IF NOT EXISTS amount");
    expect(sqlStatements[0]).toContain("numeric(12,2)");
    expect(sqlStatements[0]).toContain("DEFAULT '0.00'");
  });

  it("drops amount column on rollback", async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;
    const migration = new AddAmountToSalePaymentMethods1793000000000();

    await migration.down(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("DROP COLUMN IF EXISTS amount"),
    );
  });
});
