import { DeleteProviderPurchaseUseCase } from "./delete-provider-purchase.use-case";
import { ProviderPurchaseRepositoryPort } from "./provider-purchase.repository.port";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { NotFoundError } from "../../../shared/errors/domain.error";

describe("DeleteProviderPurchaseUseCase", () => {
  let repo: jest.Mocked<ProviderPurchaseRepositoryPort>;
  let cache: jest.Mocked<ReadCachePort>;
  let useCase: DeleteProviderPurchaseUseCase;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregateByProvider: jest.fn(),
    } as unknown as jest.Mocked<ProviderPurchaseRepositoryPort>;

    cache = {
      getOrSet: jest.fn(),
      deleteByPrefix: jest.fn(),
    } as unknown as jest.Mocked<ReadCachePort>;

    useCase = new DeleteProviderPurchaseUseCase(repo, cache);
  });

  it("deletes an existing record", async () => {
    repo.findById.mockResolvedValue({
      id: "purchase-1",
      provider_name: "Test",
      amount: "500.00",
      payment_method: "cash",
      created_at: new Date(),
      updated_at: new Date(),
    });

    await useCase.execute("purchase-1");

    expect(repo.delete).toHaveBeenCalledWith("purchase-1");
  });

  it("throws NotFoundError for non-existent id", async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute("non-existent"),
    ).rejects.toThrow(NotFoundError);

    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("invalidates report cache after delete", async () => {
    repo.findById.mockResolvedValue({
      id: "purchase-1",
      provider_name: "Test",
      amount: "500.00",
      payment_method: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await useCase.execute("purchase-1");

    expect(cache.deleteByPrefix).toHaveBeenCalledWith("reports:v1");
  });
});
