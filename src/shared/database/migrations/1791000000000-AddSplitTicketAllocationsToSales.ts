import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSplitTicketAllocationsToSales1791000000000
  implements MigrationInterface
{
  name = "AddSplitTicketAllocationsToSales1791000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sale_ticket_allocations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        sale_item_id uuid NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
        ticket_group_label varchar(100) NOT NULL,
        quantity integer NOT NULL,
        CONSTRAINT sale_ticket_allocations_quantity_check CHECK (quantity > 0),
        CONSTRAINT sale_ticket_allocations_sale_item_id_ticket_group_label_key UNIQUE (sale_item_id, ticket_group_label)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sale_ticket_allocations_sale_id
      ON sale_ticket_allocations(sale_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sale_ticket_allocations_sale_item_id
      ON sale_ticket_allocations(sale_item_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS sale_ticket_allocations;
    `);
  }
}
