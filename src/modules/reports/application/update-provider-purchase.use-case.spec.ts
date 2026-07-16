import { UpdateProviderPurchaseUseCase } from "./update-provider-purchase.use-case";
import { ProviderPurchaseRepositoryPort } from "./provider-purchase.repository.port";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { NotFoundError, ValidationError } from "../../../shared/errors/domain.error";

function makePurchase(overrides: Record<string, unknown> = {}) {
  return {
    id: "purchase-1",
    provider_name: "Proveedor Test",
    amount: "500.00",
    payment_method: "cash",
    created_at: new Date("2026-07-01T12:00:00Z"),
    updated_at: new Date("2026-07-01T12:00:00Z"),
    ...overrides,
  };
}

describe("UpdateProviderPurchaseUseCase", () => {
  let repo: jest.Mocked<ProviderPurchaseRepositoryPort>;
  let cache: jest.Mocked<ReadCachePort>;
  let useCase: UpdateProviderPurchaseUseCase;

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

    useCase = new UpdateProviderPurchaseUseCase(repo, cache);
  });

  it("updates an existing record", async () => {
    repo.findById.mockResolvedValue(makePurchase());
    repo.update.mockResolvedValue(makePurchase({ provider_name: "Updated Prov", amount: "600.00" }));

    const result = await useCase.execute("purchase-1", {
      provider_name: "Updated Prov",
      amount: "600.00",
    });

    expect(result.provider_name).toBe("Updated Prov");
    expect(result.amount).toBe("600.00");
    expect(repo.update).toHaveBeenCalledWith("purchase-1", {
      provider_name: "Updated Prov",
      amount: "600.00",
      payment_method: undefined,
    });
  });

  it("trims provider name on update", async () => {
    repo.findById.mockResolvedValue(makePurchase());
    repo.update.mockResolvedValue(makePurchase());

    await useCase.execute("purchase-1", { provider_name: "  New Prov  " });

    expect(repo.update).toHaveBeenCalledWith("purchase-1", expect.objectContaining({
      provider_name: "New Prov",
    }));
  });

  it("rejects provider name with only whitespace", async () => {
    repo.findById.mockResolvedValue(makePurchase());

    await expect(
      useCase.execute("purchase-1", { provider_name: "   " }),
    ).rejects.toThrow(new ValidationError("provider_name is required"));

    expect(repo.update).not.toHaveBeenCalled();
    expect(cache.deleteByPrefix).not.toHaveBeenCalled();
  });

  it.each(["0", "-1"])("rejects non-positive amount %s", async (amount) => {
    repo.findById.mockResolvedValue(makePurchase());

    await expect(
      useCase.execute("purchase-1", { amount }),
    ).rejects.toThrow(new ValidationError("amount must be a positive number"));

    expect(repo.update).not.toHaveBeenCalled();
    expect(cache.deleteByPrefix).not.toHaveBeenCalled();
  });

  it("allows clearing payment method with null", async () => {
    repo.findById.mockResolvedValue(makePurchase());
    repo.update.mockResolvedValue(makePurchase({ payment_method: null }));

    const result = await useCase.execute("purchase-1", {
      payment_method: null,
    });

    expect(result.payment_method).toBeNull();
    expect(repo.update).toHaveBeenCalledWith("purchase-1", expect.objectContaining({
      payment_method: null,
    }));
  });

  it("throws NotFoundError for non-existent id", async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute("non-existent", { amount: "100.00" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("invalidates report cache after update", async () => {
    repo.findById.mockResolvedValue(makePurchase());
    repo.update.mockResolvedValue(makePurchase());

    await useCase.execute("purchase-1", { amount: "700.00" });

    expect(cache.deleteByPrefix).toHaveBeenCalledWith("reports:v1");
  });

  it("does not overwrite fields not provided", async () => {
    repo.findById.mockResolvedValue(makePurchase({ amount: "500.00" }));
    repo.update.mockResolvedValue(makePurchase({ provider_name: "Only Name Changed", amount: "500.00" }));

    const result = await useCase.execute("purchase-1", {
      provider_name: "Only Name Changed",
    });

    expect(result.amount).toBe("500.00");
  });
});
