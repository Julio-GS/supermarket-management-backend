import "dotenv/config";
import { DataSource } from "typeorm";
import { InitialSchema1750000000000 } from "./migrations/0000000000000-InitialSchema";
import { AddArcaInvoiceFieldsToSales1789929600000 } from "./migrations/1789929600000-AddArcaInvoiceFieldsToSales";
import { AddPaymentMethodsToSales1790000000000 } from "./migrations/1790000000000-AddPaymentMethodsToSales";
import { AddSplitTicketAllocationsToSales1791000000000 } from "./migrations/1791000000000-AddSplitTicketAllocationsToSales";
import { AddReportReadIndexes1792000000000 } from "./migrations/1792000000000-AddReportReadIndexes";
import { AddAmountToSalePaymentMethods1793000000000 } from "./migrations/1793000000000-AddAmountToSalePaymentMethods";
import { AddPromotionsAndSaleDiscounts1800000000000 } from "./migrations/1800000000000-AddPromotionsAndSaleDiscounts";
import { AddMissingPromotionColumns1801000000000 } from "./migrations/1801000000000-AddMissingPromotionColumns";

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
    AddPaymentMethodsToSales1790000000000,
    AddSplitTicketAllocationsToSales1791000000000,
    AddReportReadIndexes1792000000000,
    AddAmountToSalePaymentMethods1793000000000,
    AddPromotionsAndSaleDiscounts1800000000000,
    AddMissingPromotionColumns1801000000000,
  ],
  migrationsRun: false,
  synchronize: false,
});
