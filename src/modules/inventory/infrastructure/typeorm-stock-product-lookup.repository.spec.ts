import { DataSource } from "typeorm";
import { TypeOrmStockProductLookupRepository } from "./typeorm-stock-product-lookup.repository";

describe("TypeOrmStockProductLookupRepository", () => {
  let dataSource: { query: jest.Mock };
  let repo: TypeOrmStockProductLookupRepository;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    repo = new TypeOrmStockProductLookupRepository(dataSource as unknown as DataSource);
  });

  it("returns { id, maneja_stock } when a product row exists", async () => {
    dataSource.query.mockResolvedValue([{ id: "prod-1", maneja_stock: true }]);

    const result = await repo.findById("prod-1");

    expect(dataSource.query).toHaveBeenCalledWith(
      "SELECT id, maneja_stock FROM products WHERE id = $1",
      ["prod-1"],
    );
    expect(result).toEqual({ id: "prod-1", maneja_stock: true });
  });

  it("returns null when no product row matches", async () => {
    dataSource.query.mockResolvedValue([]);

    const result = await repo.findById("missing");

    expect(result).toBeNull();
  });

  it("returns maneja_stock as false when the product does not track stock", async () => {
    dataSource.query.mockResolvedValue([{ id: "prod-2", maneja_stock: false }]);

    const result = await repo.findById("prod-2");

    expect(result).toEqual({ id: "prod-2", maneja_stock: false });
  });

  it("uses parameterized query to prevent SQL injection", async () => {
    dataSource.query.mockResolvedValue([]);

    await repo.findById("'; DROP TABLE products; --");

    expect(dataSource.query).toHaveBeenCalledWith(
      "SELECT id, maneja_stock FROM products WHERE id = $1",
      ["'; DROP TABLE products; --"],
    );
  });

  it("returns only id and maneja_stock even if the DB row contains extra columns", async () => {
    dataSource.query.mockResolvedValue([
      { id: "prod-1", maneja_stock: true, detalle: "Test", costo_final: "100.00" },
    ]);

    const result = await repo.findById("prod-1");

    expect(result).toEqual({ id: "prod-1", maneja_stock: true });
    expect(result).not.toHaveProperty("detalle");
    expect(result).not.toHaveProperty("costo_final");
  });
});
