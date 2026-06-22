import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { Arca } from "@arcasdk/core";
import { ArcaInvoiceAdapter } from "./arca-invoice.adapter";
import { ArcaVoucherInput } from "../application/arca-invoice.port";

jest.mock("@arcasdk/core");

describe("ArcaInvoiceAdapter", () => {
  let adapter: ArcaInvoiceAdapter;
  let configService: jest.Mocked<ConfigService>;
  let createNextVoucher: jest.Mock;

  function buildConfig(enabled: boolean, mock = false): Record<string, unknown> {
    return {
      enabled,
      mock,
      production: false,
      cuit: 20111111112,
      pto_vta: 1,
      cert: mock
        ? ""
        : "-----BEGIN CERTIFICATE-----\nMIIBkQ==\n-----END CERTIFICATE-----",
      key: mock
        ? ""
        : "-----BEGIN PRIVATE KEY-----\nMIIEvQ==\n-----END PRIVATE KEY-----",
      ticketPath: undefined,
      useHttpsAgent: false,
    };
  }

  beforeEach(async () => {
    createNextVoucher = jest.fn();
    (Arca as jest.MockedClass<typeof Arca>).mockImplementation(
      () =>
        ({
          electronicBillingService: {
            createNextVoucher,
          },
        }) as unknown as Arca,
    );

    configService = {
      getOrThrow: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    configService.getOrThrow.mockReturnValue(buildConfig(true));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArcaInvoiceAdapter,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    adapter = module.get(ArcaInvoiceAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("uses raw multiline PEM cert and key without base64 decoding", async () => {
    createNextVoucher.mockResolvedValue({
      cae: "74154876254185",
      caeFchVto: "20240111",
      response: {
        FeDetResp: {
          FECAEDetResponse: [
            {
              Resultado: "A",
              CbteDesde: 42,
            },
          ],
        },
      },
    });

    const input: ArcaVoucherInput = {
      total: "121.00",
      imp_neto: "100.00",
      imp_iva: "21.00",
      iva_buckets: [{ id: 5, base_imp: "100.00", importe: "21.00" }],
    };

    const result = await adapter.createFacturaBConsumidorFinal(input);

    expect(Arca).toHaveBeenCalledWith(
      expect.objectContaining({
        cuit: 20111111112,
        cert: expect.stringContaining("-----BEGIN CERTIFICATE-----"),
        key: expect.stringContaining("-----BEGIN PRIVATE KEY-----"),
        ticketPath: undefined,
        useHttpsAgent: false,
      }),
    );
    expect(result.cbte_nro).toBe(42);
  });

  it("forwards ticketPath and useHttpsAgent to the SDK", async () => {
    configService.getOrThrow.mockReturnValue({
      ...buildConfig(true),
      ticketPath: "./custom/tickets",
      useHttpsAgent: true,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArcaInvoiceAdapter,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    module.get(ArcaInvoiceAdapter);

    expect(Arca).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketPath: "./custom/tickets",
        useHttpsAgent: true,
      }),
    );
  });

  it("returns a deterministic fake invoice in mock mode without calling the SDK", async () => {
    jest.clearAllMocks();
    configService.getOrThrow.mockReturnValue(buildConfig(true, true));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArcaInvoiceAdapter,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    const mockAdapter = module.get(ArcaInvoiceAdapter);

    const input: ArcaVoucherInput = {
      total: "121.00",
      imp_neto: "100.00",
      imp_iva: "21.00",
      iva_buckets: [{ id: 5, base_imp: "100.00", importe: "21.00" }],
    };

    const result = await mockAdapter.createFacturaBConsumidorFinal(input);

    expect(Arca).not.toHaveBeenCalled();
    expect(createNextVoucher).not.toHaveBeenCalled();
    expect(result).toEqual({
      cae: "MOCKCAE12345678",
      cae_vto: expect.stringMatching(/^\d{8}$/),
      cbte_nro: 1,
      cbte_tipo: 6,
      pto_vta: 1,
    });
  });

  it("rejects non-accepted ARCA responses", async () => {
    createNextVoucher.mockResolvedValue({
      cae: "",
      caeFchVto: "",
      response: {
        FeDetResp: {
          FECAEDetResponse: [
            {
              Resultado: "R",
              CbteDesde: 0,
            },
          ],
        },
      },
    });

    const input: ArcaVoucherInput = {
      total: "121.00",
      imp_neto: "100.00",
      imp_iva: "21.00",
      iva_buckets: [{ id: 5, base_imp: "100.00", importe: "21.00" }],
    };

    await expect(adapter.createFacturaBConsumidorFinal(input)).rejects.toThrow(
      "ARCA invoice was not accepted",
    );
  });

  it("throws when ARCA is not enabled", async () => {
    configService.getOrThrow.mockReturnValue(buildConfig(false));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArcaInvoiceAdapter,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    const disabledAdapter = module.get(ArcaInvoiceAdapter);

    const input: ArcaVoucherInput = {
      total: "121.00",
      imp_neto: "100.00",
      imp_iva: "21.00",
      iva_buckets: [{ id: 5, base_imp: "100.00", importe: "21.00" }],
    };

    await expect(
      disabledAdapter.createFacturaBConsumidorFinal(input),
    ).rejects.toThrow("ARCA invoicing is not enabled");
    expect(createNextVoucher).not.toHaveBeenCalled();
  });
});
