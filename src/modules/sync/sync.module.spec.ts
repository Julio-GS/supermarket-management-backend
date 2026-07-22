import { ReportsModule } from "../reports/reports.module";
import { ProviderPurchaseRepositoryPort } from "../reports/application/provider-purchase.repository.port";

/**
 * Verify that ReportsModule exports ProviderPurchaseRepositoryPort
 * so that SyncModule (which imports ReportsModule) can inject it
 * into BootstrapUseCase.
 *
 * This test inspects the module's static metadata rather than
 * compiling the full DI graph (which requires a live TypeORM
 * DataSource). The companion bootstrap.use-case.spec.ts covers
 * the runtime behaviour; nest build confirms the static dependency
 * graph is sound.
 */
describe("ReportsModule exports", () => {
  it("exports ProviderPurchaseRepositoryPort so SyncModule can inject it", () => {
    const exports = Reflect.getMetadata("exports", ReportsModule) ?? [];

    expect(exports).toContain(ProviderPurchaseRepositoryPort);
  });
});
