import { Test, TestingModule } from "@nestjs/testing";
import { IssueArcaInvoiceUseCase } from "./issue-arca-invoice.use-case";
import { ArcaInvoicePort } from "./arca-invoice.port";
import { ValidationError } from "../../../shared/errors/domain.error";

describe("IssueArcaInvoiceUseCase", () => {
  let useCase: IssueArcaInvoiceUseCase;
  let arcaInvoice: jest.Mocked<ArcaInvoicePort>;

  beforeEach(async () => {
    arcaInvoice = {
      createFacturaBConsumidorFinal: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueArcaInvoiceUseCase,
        { provide: ArcaInvoicePort, useValue: arcaInvoice },
      ],
    }).compile();

    useCase = module.get(IssueArcaInvoiceUseCase);
  });

  it("computes IVA buckets from line_total and iva_rate", async () => {
    arcaInvoice.createFacturaBConsumidorFinal.mockResolvedValue({
      cae: "12345678901234",
      cae_vto: "20240111",
      cbte_nro: 5,
      cbte_tipo: 6,
      pto_vta: 1,
    });

    const result = await useCase.issue([
      { line_total: "121.00", iva_rate: "21.00" },
    ]);

    expect(arcaInvoice.createFacturaBConsumidorFinal).toHaveBeenCalledWith({
      total: "121.00",
      imp_neto: "100.00",
      imp_iva: "21.00",
      iva_buckets: [{ id: 5, base_imp: "100.00", importe: "21.00" }],
    });
    expect(result.cae).toBe("12345678901234");
  });

  it("groups multiple items by IVA rate", async () => {
    arcaInvoice.createFacturaBConsumidorFinal.mockResolvedValue({
      cae: "12345678901234",
      cae_vto: "20240111",
      cbte_nro: 6,
      cbte_tipo: 6,
      pto_vta: 1,
    });

    await useCase.issue([
      { line_total: "242.00", iva_rate: "21.00" },
      { line_total: "110.50", iva_rate: "10.50" },
    ]);

    const call = arcaInvoice.createFacturaBConsumidorFinal.mock.calls[0][0];
    expect(call.total).toBe("352.50");
    expect(call.imp_neto).toBe("300.00");
    expect(call.imp_iva).toBe("52.50");
    expect(call.iva_buckets).toEqual(
      expect.arrayContaining([
        { id: 5, base_imp: "200.00", importe: "42.00" },
        { id: 4, base_imp: "100.00", importe: "10.50" },
      ]),
    );
  });

  it("rejects unsupported IVA rates", async () => {
    await expect(
      useCase.issue([{ line_total: "100.00", iva_rate: "99.00" }]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(arcaInvoice.createFacturaBConsumidorFinal).not.toHaveBeenCalled();
  });

  it("rejects IVA 0 and 0.00 without calling ARCA adapter", async () => {
    await expect(
      useCase.issue([{ line_total: "100.00", iva_rate: "0" }]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(arcaInvoice.createFacturaBConsumidorFinal).not.toHaveBeenCalled();

    await expect(
      useCase.issue([{ line_total: "100.00", iva_rate: "0.00" }]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(arcaInvoice.createFacturaBConsumidorFinal).not.toHaveBeenCalled();
  });

  it("rejects missing, null, undefined, or empty IVA without calling ARCA adapter", async () => {
    await expect(
      useCase.issue([{ line_total: "100.00", iva_rate: "" }]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(arcaInvoice.createFacturaBConsumidorFinal).not.toHaveBeenCalled();

    await expect(
      useCase.issue([{ line_total: "100.00", iva_rate: null as unknown as string }]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(arcaInvoice.createFacturaBConsumidorFinal).not.toHaveBeenCalled();

    await expect(
      useCase.issue([{ line_total: "100.00", iva_rate: undefined as unknown as string }]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(arcaInvoice.createFacturaBConsumidorFinal).not.toHaveBeenCalled();
  });

  it("rejects other unsupported rates (27, 5, 2.5) without calling ARCA adapter", async () => {
    await expect(
      useCase.issue([{ line_total: "100.00", iva_rate: "27.00" }]),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      useCase.issue([{ line_total: "100.00", iva_rate: "5.00" }]),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      useCase.issue([{ line_total: "100.00", iva_rate: "2.50" }]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(arcaInvoice.createFacturaBConsumidorFinal).not.toHaveBeenCalled();
  });

  it("accepts valid unpadded '10.5' and '21' rates", async () => {
    arcaInvoice.createFacturaBConsumidorFinal.mockResolvedValue({
      cae: "12345678901234",
      cae_vto: "20240111",
      cbte_nro: 7,
      cbte_tipo: 6,
      pto_vta: 1,
    });

    await useCase.issue([
      { line_total: "110.50", iva_rate: "10.5" },
      { line_total: "121.00", iva_rate: "21" },
    ]);

    expect(arcaInvoice.createFacturaBConsumidorFinal).toHaveBeenCalledWith({
      total: "231.50",
      imp_neto: "200.00",
      imp_iva: "31.50",
      iva_buckets: expect.arrayContaining([
        { id: 4, base_imp: "100.00", importe: "10.50" },
        { id: 5, base_imp: "100.00", importe: "21.00" },
      ]),
    });
  });

  it("rejects empty item lists", async () => {
    await expect(useCase.issue([])).rejects.toBeInstanceOf(ValidationError);
  });
});
