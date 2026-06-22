import "dotenv/config";
import { DataSource } from "typeorm";
import { InitialSchema1750000000000 } from "./migrations/0000000000000-InitialSchema";
import { AddArcaInvoiceFieldsToSales1789929600000 } from "./migrations/1789929600000-AddArcaInvoiceFieldsToSales";

export default new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("neon")
    ? { rejectUnauthorized: false }
    : undefined,
  entities: [__dirname + "/../../modules/**/*.entity.ts"],
  migrations: [
    InitialSchema1750000000000,
    AddArcaInvoiceFieldsToSales1789929600000,
  ],
  migrationsRun: false,
  synchronize: false,
});
