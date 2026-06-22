import { Test, TestingModule } from "@nestjs/testing";
import { IssueArcaInvoiceUseCase } from "./issue-arca-invoice.use-case";
import { ArcaInvoicePort } from "./arca-invoice.port";
import { ValidationError } from "../../../shared/errors/domain.error";
import { Product } from "../../products/domain/product.entity";

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-id",
    detalle: "Test Product",
    costo_neto: "100.00",
    costo_final: "121.00",
    iva: "21.00",
    cambio_costo: "2024-01-01",
    cambio_precio: "2024-01-01",
    etiqueta: "test",
    facturable: true,
    maneja_stock: false,
    codigos: ["123456"],
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

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

  it("computes IVA buckets from costo_neto and costo_final", async () => {
    const product = buildProduct();
    arcaInvoice.createFacturaBConsumidorFinal.mockResolvedValue({
      cae: "12345678901234",
      cae_vto: "20240111",
      cbte_nro: 5,
      cbte_tipo: 6,
      pto_vta: 1,
    });

    const result = await useCase.issue([{ product, quantity: 1 }]);

    expect(arcaInvoice.createFacturaBConsumidorFinal).toHaveBeenCalledWith({
      total: "121.00",
      imp_neto: "100.00",
      imp_iva: "21.00",
      iva_buckets: [{ id: 5, base_imp: "100.00", importe: "21.00" }],
    });
    expect(result.cae).toBe("12345678901234");
  });

  it("groups multiple items by IVA rate", async () => {
    const product21 = buildProduct({
      id: "p21",
      costo_neto: "100.00",
      costo_final: "121.00",
      iva: "21.00",
    });
    const product105 = buildProduct({
      id: "p105",
      costo_neto: "100.00",
      costo_final: "110.50",
      iva: "10.50",
    });
    arcaInvoice.createFacturaBConsumidorFinal.mockResolvedValue({
      cae: "12345678901234",
      cae_vto: "20240111",
      cbte_nro: 6,
      cbte_tipo: 6,
      pto_vta: 1,
    });

    await useCase.issue([
      { product: product21, quantity: 2 },
      { product: product105, quantity: 1 },
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
    const product = buildProduct({ iva: "99.00" });

    await expect(
      useCase.issue([{ product, quantity: 1 }]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(arcaInvoice.createFacturaBConsumidorFinal).not.toHaveBeenCalled();
  });

  it("rejects empty item lists", async () => {
    await expect(useCase.issue([])).rejects.toBeInstanceOf(ValidationError);
  });
});
