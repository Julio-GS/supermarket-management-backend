import { registerAs } from "@nestjs/config";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { InitialSchema1750000000000 } from "../database/migrations/0000000000000-InitialSchema";
import { AddArcaInvoiceFieldsToSales1789929600000 } from "../database/migrations/1789929600000-AddArcaInvoiceFieldsToSales";
import { AddPaymentMethodsToSales1790000000000 } from "../database/migrations/1790000000000-AddPaymentMethodsToSales";
import { AddSplitTicketAllocationsToSales1791000000000 } from "../database/migrations/1791000000000-AddSplitTicketAllocationsToSales";
import { AddReportReadIndexes1792000000000 } from "../database/migrations/1792000000000-AddReportReadIndexes";
import { AddAmountToSalePaymentMethods1793000000000 } from "../database/migrations/1793000000000-AddAmountToSalePaymentMethods";
import { AddPromotionsAndSaleDiscounts1800000000000 } from "../database/migrations/1800000000000-AddPromotionsAndSaleDiscounts";
import { AddSpecialProductCodes1802000000000 } from "../database/migrations/1802000000000-AddSpecialProductCodes";
import { AddProviderPurchases1803000000000 } from "../database/migrations/1803000000000-AddProviderPurchases";

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
      AddPaymentMethodsToSales1790000000000,
      AddSplitTicketAllocationsToSales1791000000000,
      AddReportReadIndexes1792000000000,
      AddAmountToSalePaymentMethods1793000000000,
      AddPromotionsAndSaleDiscounts1800000000000,
      AddSpecialProductCodes1802000000000,
      AddProviderPurchases1803000000000,
    ],
    migrationsRun: process.env.NODE_ENV !== "test",
  }),
);
