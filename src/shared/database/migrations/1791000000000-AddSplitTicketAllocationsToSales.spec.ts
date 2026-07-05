import { QueryRunner } from "typeorm";
import { AddSplitTicketAllocationsToSales1791000000000 } from "./1791000000000-AddSplitTicketAllocationsToSales";

describe("AddSplitTicketAllocationsToSales1791000000000", () => {
  it("creates sale_ticket_allocations without backfilling existing sales", async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;
    const migration = new AddSplitTicketAllocationsToSales1791000000000();

    await migration.up(queryRunner);

    const sqlStatements = (queryRunner.query as jest.Mock).mock.calls.map(
      ([sql]) => sql as string,
    );

    expect(sqlStatements).toHaveLength(3);
    expect(sqlStatements[0]).toContain(
      "CREATE TABLE IF NOT EXISTS sale_ticket_allocations",
    );
    expect(sqlStatements[1]).toContain(
      "CREATE INDEX IF NOT EXISTS idx_sale_ticket_allocations_sale_id",
    );
    expect(sqlStatements[2]).toContain(
      "CREATE INDEX IF NOT EXISTS idx_sale_ticket_allocations_sale_item_id",
    );
    expect(sqlStatements.join("\n")).not.toMatch(/\bINSERT\b/i);
    expect(sqlStatements.join("\n")).not.toMatch(/\bUPDATE\b/i);
  });

  it("drops sale_ticket_allocations on rollback", async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;
    const migration = new AddSplitTicketAllocationsToSales1791000000000();

    await migration.down(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining("DROP TABLE IF EXISTS sale_ticket_allocations"),
    );
  });
});
