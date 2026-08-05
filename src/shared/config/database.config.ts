import { registerAs } from "@nestjs/config";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { InitialSchema1750000000000 } from "../database/migrations/0000000000000-InitialSchema";
import { AddArcaInvoiceFieldsToSales1789929600000 } from "../database/migrations/1789929600000-AddArcaInvoiceFieldsToSales";
import { AddPaymentMethodsToSales1790000000000 } from "../database/migrations/1790000000000-AddPaymentMethodsToSales";
import { AddSplitTicketAllocationsToSales1791000000000 } from "../database/migrations/1791000000000-AddSplitTicketAllocationsToSales";
import { AddReportReadIndexes1792000000000 } from "../database/migrations/1792000000000-AddReportReadIndexes";
import { AddAmountToSalePaymentMethods1793000000000 } from "../database/migrations/1793000000000-AddAmountToSalePaymentMethods";
import { AddPromotionsAndSaleDiscounts1800000000000 } from "../database/migrations/1800000000000-AddPromotionsAndSaleDiscounts";
import { AddMissingPromotionColumns1801000000000 } from "../database/migrations/1801000000000-AddMissingPromotionColumns";
import { AddSpecialProductCodes1802000000000 } from "../database/migrations/1802000000000-AddSpecialProductCodes";
import { AddProviderPurchases1803000000000 } from "../database/migrations/1803000000000-AddProviderPurchases";
import { AddAdhocSaleItems1804000000000 } from "../database/migrations/1804000000000-AddAdhocSaleItems";
import { AddInventoryControl1805000000000 } from "../database/migrations/1805000000000-AddInventoryControl";
import { AddSyncIdempotency1806000000000 } from "../database/migrations/1806000000000-AddSyncIdempotency";
import { AddSyncTombstones1807000000000 } from "../database/migrations/1807000000000-AddSyncTombstones";
import { AddLabelPrintJobs1808000000000 } from "../database/migrations/1808000000000-AddLabelPrintJobs";
import { AddSourceToLabelPrintJobs1809000000000 } from "../database/migrations/1809000000000-AddSourceToLabelPrintJobs";
import { AddAutoJobConcurrencyGuard1810000000000 } from "../database/migrations/1810000000000-AddAutoJobConcurrencyGuard";
import { AddSupersededStatusToLabelPrintJobs1811000000000 } from "../database/migrations/1811000000000-AddSupersededStatusToLabelPrintJobs";
import { FixLabelPrintJobsTimestamptz1812000000000 } from "../database/migrations/1812000000000-FixLabelPrintJobsTimestamptz";

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
      AddMissingPromotionColumns1801000000000,
      AddSpecialProductCodes1802000000000,
      AddProviderPurchases1803000000000,
      AddAdhocSaleItems1804000000000,
      AddInventoryControl1805000000000,
      AddSyncIdempotency1806000000000,
      AddSyncTombstones1807000000000,
      AddLabelPrintJobs1808000000000,
      AddSourceToLabelPrintJobs1809000000000,
      AddAutoJobConcurrencyGuard1810000000000,
      AddSupersededStatusToLabelPrintJobs1811000000000,
      FixLabelPrintJobsTimestamptz1812000000000,
    ],
    migrationsRun: process.env.NODE_ENV !== "test",
  }),
);
