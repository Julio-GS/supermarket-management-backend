import { ListProductsUseCase } from "./list-products.use-case";
import { ProductRepositoryPort } from "./product.repository.port";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { createPage } from "../../../shared/read-model/page";

describe("ListProductsUseCase", () => {
  let products: jest.Mocked<ProductRepositoryPort>;
  let cache: jest.Mocked<ReadCachePort>;
  let useCase: ListProductsUseCase;

  beforeEach(() => {
    products = {
      create: jest.fn(),
      findAll: jest.fn(),
      findPage: jest.fn(),
      findById: jest.fn(),
      findByIdsForSale: jest.fn(),
      findByBarcode: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      existsAnyBarcode: jest.fn(),
    };
    cache = {
      getOrSet: jest.fn(
        <T>(_key: string, _ttl: number, load: () => Promise<T>) => load(),
      ),
      deleteByPrefix: jest.fn(),
    } as unknown as jest.Mocked<ReadCachePort>;
    useCase = new ListProductsUseCase(products, cache);
  });

  it("caches compatible unpaginated product reads", async () => {
    products.findAll.mockResolvedValue([]);

    await useCase.execute();

    expect(cache.getOrSet).toHaveBeenCalledWith(
      expect.stringContaining("products:v1:list:all:"),
      30_000,
      expect.any(Function),
    );
    expect(products.findAll).toHaveBeenCalledWith({ search: undefined });
  });

  it("caches search reads with the normalized search term", async () => {
    products.findAll.mockResolvedValue([]);

    await useCase.execute({ search: "  leche  " });

    expect(cache.getOrSet).toHaveBeenCalledWith(
      expect.stringContaining("products:v1:list:all:"),
      30_000,
      expect.any(Function),
    );
    expect(products.findAll).toHaveBeenCalledWith({ search: "leche" });
  });

  it("delegates paginated reads to the repository page contract", async () => {
    const options = { page: 1, limit: 20, sort: "created_at:desc" };
    products.findPage.mockResolvedValue(createPage([], 0, options));

    await expect(useCase.executePage(options)).resolves.toEqual(
      createPage([], 0, options),
    );
    expect(products.findPage).toHaveBeenCalledWith({
      ...options,
      search: undefined,
    });
  });
});
