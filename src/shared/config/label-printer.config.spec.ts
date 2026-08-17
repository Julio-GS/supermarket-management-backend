import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { labelPrinterConfig } from "./label-printer.config";

describe("labelPrinterConfig", () => {
  const KEY = "LABEL_CLAIM_CURSOR_SECRET";
  const original = process.env[KEY];

  beforeEach(() => {
    delete process.env[KEY];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it("does not fail module construction when the cursor secret is missing", async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [labelPrinterConfig], ignoreEnvFile: true }),
      ],
    }).compile();
    const config = module.get(ConfigService);
    expect(config.get("labelPrinter.claimCursorSecret")).toBeUndefined();
  });

  it("exposes the cursor secret from the environment when present", async () => {
    process.env[KEY] = "s".repeat(64);
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [labelPrinterConfig], ignoreEnvFile: true }),
      ],
    }).compile();
    const config = module.get(ConfigService);
    expect(config.get("labelPrinter.claimCursorSecret")).toBe("s".repeat(64));
  });
});
