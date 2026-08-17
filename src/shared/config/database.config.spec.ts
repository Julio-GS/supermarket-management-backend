import { databaseConfig } from "./database.config";

describe("database.config", () => {
  describe("migrations array", () => {
    it("matches the CLI data-source.ts migration order exactly", () => {
      const config = databaseConfig();
      const migrationNames = (config.migrations as Function[]).map(
        (m) => m.name,
      );

      // Ordered list must match CLI data-source.ts exactly
      expect(migrationNames).toEqual([
        "InitialSchema1750000000000",
        "AddArcaInvoiceFieldsToSales1789929600000",
        "AddPaymentMethodsToSales1790000000000",
        "AddSplitTicketAllocationsToSales1791000000000",
        "AddReportReadIndexes1792000000000",
        "AddAmountToSalePaymentMethods1793000000000",
        "AddPromotionsAndSaleDiscounts1800000000000",
        "AddMissingPromotionColumns1801000000000",
        "AddSpecialProductCodes1802000000000",
        "AddProviderPurchases1803000000000",
        "AddAdhocSaleItems1804000000000",
        "AddInventoryControl1805000000000",
        "AddSyncIdempotency1806000000000",
        "AddSyncTombstones1807000000000",
        "AddLabelPrintJobs1808000000000",
        "AddSourceToLabelPrintJobs1809000000000",
        "AddAutoJobConcurrencyGuard1810000000000",
        "AddSupersededStatusToLabelPrintJobs1811000000000",
        "FixLabelPrintJobsTimestamptz1812000000000",
        "AddProductCreateIdempotencyKeys1813000000000",
        "AddSaleManualDiscount1814000000000",
        "AddBlockedForReviewToLabelPrintJobs1815000000000",
      ]);
    });

    it("has exactly 22 migrations (same count as CLI data-source.ts)", () => {
      const config = databaseConfig();
      const migrations = config.migrations as Function[];
      expect(migrations).toHaveLength(22);
    });
  });
});
