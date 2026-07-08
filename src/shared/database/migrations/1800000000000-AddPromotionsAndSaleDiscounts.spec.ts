import { QueryRunner } from "typeorm";
import { AddPromotionsAndSaleDiscounts1800000000000 } from "./1800000000000-AddPromotionsAndSaleDiscounts";

describe("AddPromotionsAndSaleDiscounts1800000000000", () => {
  it("creates the promotions table with all required columns", async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;
    const migration = new AddPromotionsAndSaleDiscounts1800000000000();

    await migration.up(queryRunner);

    const sqlStatements = (queryRunner.query as jest.Mock).mock.calls.map(
      ([sql]) => sql as string,
    );

    expect(sqlStatements).toHaveLength(2);

    // First statement: create promotions table
    const createPromotionsSQL = sqlStatements[0];
    expect(createPromotionsSQL).toContain("CREATE TABLE IF NOT EXISTS promotions");
    expect(createPromotionsSQL).toContain("id uuid NOT NULL DEFAULT uuid_generate_v4()");
    expect(createPromotionsSQL).toContain("name varchar(255) NOT NULL");
    expect(createPromotionsSQL).toContain("description text");
    expect(createPromotionsSQL).toContain("scope varchar(20) NOT NULL DEFAULT 'product'");
    expect(createPromotionsSQL).toContain("product_id uuid");
    expect(createPromotionsSQL).toContain("type varchar(20) NOT NULL");
    expect(createPromotionsSQL).toContain("discount_percent integer");
    expect(createPromotionsSQL).toContain("start_date timestamptz");
    expect(createPromotionsSQL).toContain("end_date timestamptz");
    expect(createPromotionsSQL).toContain("weekdays integer[]");
    expect(createPromotionsSQL).toContain("enabled boolean NOT NULL DEFAULT true");
    expect(createPromotionsSQL).toContain("created_at timestamptz NOT NULL DEFAULT now()");
    expect(createPromotionsSQL).toContain("updated_at timestamptz NOT NULL DEFAULT now()");
    expect(createPromotionsSQL).toContain("PRIMARY KEY (id)");

    // Second statement: add discount columns to sale_items
    const alterSaleItemsSQL = sqlStatements[1];
    expect(alterSaleItemsSQL).toContain("ALTER TABLE sale_items");
    expect(alterSaleItemsSQL).toContain(
      "ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT '0.00'",
    );
    expect(alterSaleItemsSQL).toContain(
      "ADD COLUMN IF NOT EXISTS applied_promotion_id uuid",
    );
    expect(alterSaleItemsSQL).toContain(
      "ADD COLUMN IF NOT EXISTS applied_promotion_type varchar(20)",
    );
    expect(alterSaleItemsSQL).toContain(
      "ADD COLUMN IF NOT EXISTS applied_promotions jsonb NOT NULL DEFAULT '[]'::jsonb",
    );
  });

  it("drops promotions table and discount columns on rollback", async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;
    const migration = new AddPromotionsAndSaleDiscounts1800000000000();

    await migration.down(queryRunner);

    const sqlStatements = (queryRunner.query as jest.Mock).mock.calls.map(
      ([sql]) => sql as string,
    );

    expect(sqlStatements).toHaveLength(2);

    expect(sqlStatements[0]).toContain("ALTER TABLE sale_items");
    expect(sqlStatements[0]).toContain("DROP COLUMN IF EXISTS discount_amount");
    expect(sqlStatements[0]).toContain("DROP COLUMN IF EXISTS applied_promotion_id");
    expect(sqlStatements[0]).toContain("DROP COLUMN IF EXISTS applied_promotion_type");
    expect(sqlStatements[0]).toContain("DROP COLUMN IF EXISTS applied_promotions");

    expect(sqlStatements[1]).toContain("DROP TABLE IF EXISTS promotions");
  });
});
