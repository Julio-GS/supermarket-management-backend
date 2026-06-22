import { registerAs } from "@nestjs/config";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { InitialSchema1750000000000 } from "../database/migrations/0000000000000-InitialSchema";
import { AddArcaInvoiceFieldsToSales1789929600000 } from "../database/migrations/1789929600000-AddArcaInvoiceFieldsToSales";

export const databaseConfig = registerAs(
  "database",
  (): TypeOrmModuleOptions => ({
    type: "postgres",
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("neon")
      ? { rejectUnauthorized: false }
      : undefined,
    autoLoadEntities: true,
    synchronize: false,
    logging: process.env.NODE_ENV === "development",
    migrations: [
      InitialSchema1750000000000,
      AddArcaInvoiceFieldsToSales1789929600000,
    ],
    migrationsRun: process.env.NODE_ENV !== "test",
  }),
);
