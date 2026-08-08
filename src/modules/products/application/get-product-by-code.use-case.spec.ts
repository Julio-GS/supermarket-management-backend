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

    it("looks up a short registered code '77909145' by exact equality", async () => {
      const product = buildProduct({ codigos: ["77909145"] });
      products.findByBarcode.mockResolvedValue(product);

      const result = await useCase.execute("77909145");

      expect(result).toBe(product);
      expect(products.findByBarcode).toHaveBeenCalledWith("77909145");
    });

    it("looks up a long registered code by exact equality", async () => {
      const longCode = "ABC-12345678901234567890";
      const product = buildProduct({ codigos: [longCode] });
      products.findByBarcode.mockResolvedValue(product);

      const result = await useCase.execute(longCode);

      expect(result).toBe(product);
      expect(products.findByBarcode).toHaveBeenCalledWith(longCode);
    });

    it("passes internal whitespace through unchanged", async () => {
      const product = buildProduct({ codigos: ["779 09145"] });
      products.findByBarcode.mockResolvedValue(product);

      const result = await useCase.execute("779 09145");

      expect(result).toBe(product);
      expect(products.findByBarcode).toHaveBeenCalledWith("779 09145");
    });

    it("does not pad short codes to any fixed length", async () => {
      const product = buildProduct({ codigos: ["1234"] });
      products.findByBarcode.mockResolvedValue(product);

      await useCase.execute("1234");

      // Must call with exact "1234", not "0000000001234"
      expect(products.findByBarcode).toHaveBeenCalledWith("1234");
    });
});
