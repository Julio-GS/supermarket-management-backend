import { Test, TestingModule } from "@nestjs/testing";
import { GetProductByCodeUseCase } from "./get-product-by-code.use-case";
import { ProductRepositoryPort } from "./product.repository.port";
import { NotFoundError } from "../../../shared/errors/domain.error";
import { Product } from "../domain/product.entity";

function buildProduct(overrides: Partial<Product> = {}): Product {
  const p = new Product();
  p.id = "prod-special";
  p.detalle = "Fiambre";
  p.costo_neto = undefined as unknown as string;
  p.costo_final = undefined as unknown as string;
  p.iva = undefined as unknown as string;
  p.cambio_costo = "";
  p.cambio_precio = "";
  p.etiqueta = "";
  p.facturable = false;
  p.maneja_stock = false;
  p.codigos = ["1"];
  p.created_at = new Date();
  p.updated_at = new Date();
  return Object.assign(p, overrides);
}

describe("GetProductByCodeUseCase", () => {
  let useCase: GetProductByCodeUseCase;
  let products: jest.Mocked<Pick<ProductRepositoryPort, "findByBarcode">>;

  beforeEach(async () => {
    products = { findByBarcode: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetProductByCodeUseCase,
        { provide: ProductRepositoryPort, useValue: products },
      ],
    }).compile();

    useCase = module.get(GetProductByCodeUseCase);
  });

  it("returns the product for a known special code", async () => {
    const product = buildProduct();
    products.findByBarcode.mockResolvedValue(product);

    const result = await useCase.execute("1");

    expect(result).toBe(product);
    expect(products.findByBarcode).toHaveBeenCalledWith("1");
  });

  it("throws NotFoundError when code is not found", async () => {
    products.findByBarcode.mockResolvedValue(null);

    await expect(useCase.execute("99")).rejects.toBeInstanceOf(NotFoundError);
    expect(products.findByBarcode).toHaveBeenCalledWith("99");
  });

  it("throws NotFoundError when code is an empty string", async () => {
    products.findByBarcode.mockResolvedValue(null);

    await expect(useCase.execute("")).rejects.toBeInstanceOf(NotFoundError);
  });
});
