import "reflect-metadata";
import { AppModule } from "../../app.module";
import { LabelPrinterModule } from "./label-printer.module";
import { ClaimBatchContinueUseCase } from "./application/claim-batch-continue.use-case";
import { ClaimBatchCursorService } from "./application/claim-batch-cursor.service";
import { BlockJobUseCase } from "./application/block-job.use-case";
import { PrintJobController } from "./presentation/print-job.controller";
import { PrintJobRepositoryPort } from "./application/print-job.repository.port";

/**
 * Wiring verification for WU3 (label claim continuation cursor).
 *
 * Mirrors `sync.module.spec.ts`: it inspects static module metadata rather
 * than compiling the full DI graph, which would require a live TypeORM
 * DataSource. `nest build` + tsc confirm the static dependency graph.
 *
 * The critical guarantee under test: the continuation use case and its lazy
 * cursor service must be registered so the new `POST /label-print-jobs/
 * claim-batch/continue` route resolves at application startup, while the
 * existing raw-array `claim-batch` route and repository export stay intact.
 */
describe("LabelPrinterModule wiring", () => {
  it("registers ClaimBatchContinueUseCase and ClaimBatchCursorService providers", () => {
    const providers: unknown[] =
      Reflect.getMetadata("providers", LabelPrinterModule) ?? [];

    const tokens = providers.flatMap((p) =>
      p && typeof p === "object" && "provide" in (p as object)
        ? [(p as { provide: unknown }).provide]
        : [p],
    );

    expect(tokens).toContain(ClaimBatchContinueUseCase);
    expect(tokens).toContain(ClaimBatchCursorService);
    expect(tokens).toContain(BlockJobUseCase);
  });

  it("keeps the print job controller wired", () => {
    const controllers: unknown[] =
      Reflect.getMetadata("controllers", LabelPrinterModule) ?? [];
    expect(controllers).toContain(PrintJobController);
  });

  it("still exports PrintJobRepositoryPort for other modules", () => {
    const exported: unknown[] =
      Reflect.getMetadata("exports", LabelPrinterModule) ?? [];
    expect(exported).toContain(PrintJobRepositoryPort);
  });
});

describe("AppModule config registration", () => {
  it("loads labelPrinterConfig so the cursor secret is resolvable at runtime", async () => {
    const imports: unknown[] = Reflect.getMetadata("imports", AppModule) ?? [];

    // ConfigModule.forRoot (v4) returns a Promise<DynamicModule>; resolve all
    // imports so both it and TypeOrmModule.forRootAsync can be inspected.
    const resolved = await Promise.all(
      imports.map((entry) => Promise.resolve(entry)),
    );

    const configModules = resolved.filter(
      (m) =>
        m &&
        typeof m === "object" &&
        (m as { module?: { name?: string } }).module?.name === "ConfigModule",
    );

    expect(configModules.length).toBeGreaterThan(0);

    const tokens = configModules.flatMap((m) =>
      ((m as { providers?: unknown[] }).providers ?? []).map(
        (p) => (p as { provide?: unknown }).provide,
      ),
    );

    expect(tokens).toContain("CONFIGURATION(labelPrinter)");
  });
});
