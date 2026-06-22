import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { arcaConfig } from "./arca.config";

describe("arcaConfig", () => {
  const trackedKeys = [
    "ARCA_ENABLED",
    "ARCA_MOCK",
    "ARCA_PRODUCTION",
    "ARCA_CUIT",
    "ARCA_PTO_VTA",
    "ARCA_CERT",
    "ARCA_KEY",
    "ARCA_CERT_PATH",
    "ARCA_KEY_PATH",
    "ARCA_TICKET_PATH",
    "ARCA_USE_HTTPS_AGENT",
  ];
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of trackedKeys) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of trackedKeys) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it("fails fast at startup when ARCA is enabled but required credentials are missing", async () => {
    process.env.ARCA_ENABLED = "true";

    await expect(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ load: [arcaConfig], ignoreEnvFile: true }),
        ],
      }).compile(),
    ).rejects.toThrow(
      /ARCA_ENABLED is true, but the following required environment variables are missing: ARCA_CUIT, ARCA_PTO_VTA, ARCA_CERT \(or ARCA_CERT_PATH\), ARCA_KEY \(or ARCA_KEY_PATH\)/,
    );
  });

  it("does not fail at startup when ARCA is disabled and credentials are missing", async () => {
    process.env.ARCA_ENABLED = "false";

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [arcaConfig], ignoreEnvFile: true }),
      ],
    }).compile();

    expect(module).toBeDefined();
  });

  it("permits enabled+mock without cert/key and exposes mock=true", async () => {
    process.env.ARCA_ENABLED = "true";
    process.env.ARCA_MOCK = "true";
    process.env.ARCA_CUIT = "20111111112";
    process.env.ARCA_PTO_VTA = "1";
    delete process.env.ARCA_CERT;
    delete process.env.ARCA_KEY;
    delete process.env.ARCA_CERT_PATH;
    delete process.env.ARCA_KEY_PATH;

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [arcaConfig], ignoreEnvFile: true }),
      ],
    }).compile();

    const configService = module.get(ConfigService);
    const config = configService.get<ReturnType<typeof arcaConfig>>("arca");

    expect(config).toBeDefined();
    expect(config!.enabled).toBe(true);
    expect(config!.mock).toBe(true);
    expect(config!.cert).toBe("");
    expect(config!.key).toBe("");
  });

  it("normalizes escaped-newline PEM cert/key values and still validates", async () => {
    process.env.ARCA_ENABLED = "true";
    process.env.ARCA_CUIT = "20111111112";
    process.env.ARCA_PTO_VTA = "1";
    process.env.ARCA_CERT =
      "-----BEGIN CERTIFICATE-----\\nMIIBkQ==\\n-----END CERTIFICATE-----";
    process.env.ARCA_KEY =
      "-----BEGIN PRIVATE KEY-----\\nMIIEvQ==\\n-----END PRIVATE KEY-----";

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [arcaConfig], ignoreEnvFile: true }),
      ],
    }).compile();

    const configService = module.get(ConfigService);
    const config = configService.get<ReturnType<typeof arcaConfig>>("arca");

    expect(config).toBeDefined();
    expect(config!.cert).toContain("\n");
    expect(config!.cert).not.toContain("\\n");
    expect(config!.cert).toContain("-----BEGIN CERTIFICATE-----");
    expect(config!.key).toContain("\n");
    expect(config!.key).not.toContain("\\n");
    expect(config!.key).toContain("-----BEGIN PRIVATE KEY-----");
  });

  it("trims surrounding whitespace from PEM values", async () => {
    process.env.ARCA_ENABLED = "true";
    process.env.ARCA_CUIT = "20111111112";
    process.env.ARCA_PTO_VTA = "1";
    process.env.ARCA_CERT =
      "  -----BEGIN CERTIFICATE-----\\nMIIBkQ==\\n-----END CERTIFICATE-----  ";
    process.env.ARCA_KEY =
      "  -----BEGIN PRIVATE KEY-----\\nMIIEvQ==\\n-----END PRIVATE KEY-----  ";

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [arcaConfig], ignoreEnvFile: true }),
      ],
    }).compile();

    const configService = module.get(ConfigService);
    const config = configService.get<ReturnType<typeof arcaConfig>>("arca");

    expect(config!.cert.startsWith(" ")).toBe(false);
    expect(config!.cert.endsWith(" ")).toBe(false);
    expect(config!.key.startsWith(" ")).toBe(false);
    expect(config!.key.endsWith(" ")).toBe(false);
  });

  it("accepts true multiline PEM values without escaped newlines", async () => {
    process.env.ARCA_ENABLED = "true";
    process.env.ARCA_CUIT = "20111111112";
    process.env.ARCA_PTO_VTA = "1";
    process.env.ARCA_CERT =
      "-----BEGIN CERTIFICATE-----\nMIIBkQ==\n-----END CERTIFICATE-----";
    process.env.ARCA_KEY =
      "-----BEGIN PRIVATE KEY-----\nMIIEvQ==\n-----END PRIVATE KEY-----";

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [arcaConfig], ignoreEnvFile: true }),
      ],
    }).compile();

    const configService = module.get(ConfigService);
    const config = configService.get<ReturnType<typeof arcaConfig>>("arca");

    expect(config!.cert).toContain("\n");
    expect(config!.cert).toContain("-----BEGIN CERTIFICATE-----");
    expect(config!.key).toContain("\n");
    expect(config!.key).toContain("-----BEGIN PRIVATE KEY-----");
  });

  it("normalizes CRLF and bare carriage returns to LF", async () => {
    process.env.ARCA_ENABLED = "true";
    process.env.ARCA_CUIT = "20111111112";
    process.env.ARCA_PTO_VTA = "1";
    process.env.ARCA_CERT =
      "-----BEGIN CERTIFICATE-----\r\nMIIBkQ==\r-----END CERTIFICATE-----";
    process.env.ARCA_KEY =
      "-----BEGIN PRIVATE KEY-----\r\nMIIEvQ==\r-----END PRIVATE KEY-----";

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [arcaConfig], ignoreEnvFile: true }),
      ],
    }).compile();

    const configService = module.get(ConfigService);
    const config = configService.get<ReturnType<typeof arcaConfig>>("arca");

    expect(config!.cert).not.toContain("\r");
    expect(config!.key).not.toContain("\r");
    expect(config!.cert).toContain("\n");
    expect(config!.key).toContain("\n");
  });

  it("reads PEM cert/key from file paths when env values are not PEM", async () => {
    process.env.ARCA_ENABLED = "true";
    process.env.ARCA_CUIT = "20111111112";
    process.env.ARCA_PTO_VTA = "1";
    delete process.env.ARCA_CERT;
    delete process.env.ARCA_KEY;

    const certFile = path.join(os.tmpdir(), `arca-cert-${Date.now()}.crt`);
    const keyFile = path.join(os.tmpdir(), `arca-key-${Date.now()}.key`);
    fs.writeFileSync(
      certFile,
      "-----BEGIN CERTIFICATE-----\nMIIBkQ==\n-----END CERTIFICATE-----",
    );
    fs.writeFileSync(
      keyFile,
      "-----BEGIN PRIVATE KEY-----\nMIIEvQ==\n-----END PRIVATE KEY-----",
    );
    process.env.ARCA_CERT_PATH = certFile;
    process.env.ARCA_KEY_PATH = keyFile;

    try {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ load: [arcaConfig], ignoreEnvFile: true }),
        ],
      }).compile();

      const configService = module.get(ConfigService);
      const config = configService.get<ReturnType<typeof arcaConfig>>("arca");

      expect(config!.cert).toContain("-----BEGIN CERTIFICATE-----");
      expect(config!.cert).toContain("\n");
      expect(config!.key).toContain("-----BEGIN PRIVATE KEY-----");
      expect(config!.key).toContain("\n");
    } finally {
      fs.unlinkSync(certFile);
      fs.unlinkSync(keyFile);
    }
  });

  it("exposes ticketPath and useHttpsAgent from environment", async () => {
    process.env.ARCA_ENABLED = "false";
    process.env.ARCA_TICKET_PATH = "./custom/tickets";
    process.env.ARCA_USE_HTTPS_AGENT = "true";

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [arcaConfig], ignoreEnvFile: true }),
      ],
    }).compile();

    const configService = module.get(ConfigService);
    const config = configService.get<ReturnType<typeof arcaConfig>>("arca");

    expect(config!.ticketPath).toBe("./custom/tickets");
    expect(config!.useHttpsAgent).toBe(true);
  });
});
