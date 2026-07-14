import { CreateProviderPurchaseUseCase } from "./create-provider-purchase.use-case";
import { ProviderPurchaseRepositoryPort } from "./provider-purchase.repository.port";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { ValidationError } from "../../../shared/errors/domain.error";

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

describe("CreateProviderPurchaseUseCase", () => {
  let repo: jest.Mocked<ProviderPurchaseRepositoryPort>;
  let cache: jest.Mocked<ReadCachePort>;
  let useCase: CreateProviderPurchaseUseCase;

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

    useCase = new CreateProviderPurchaseUseCase(repo, cache);
  });

  it("creates a purchase with required fields", async () => {
    repo.create.mockResolvedValue(makePurchase());

    const result = await useCase.execute({
      provider_name: "Proveedor Test",
      amount: "500.00",
    });

    expect(result.provider_name).toBe("Proveedor Test");
    expect(result.amount).toBe("500.00");
    expect(result.payment_method).toBe("cash");
    expect(repo.create).toHaveBeenCalledWith({
      provider_name: "Proveedor Test",
      amount: "500.00",
      payment_method: undefined,
    });
  });

  it("creates a purchase with optional payment method", async () => {
    repo.create.mockResolvedValue(makePurchase({ payment_method: "transfer" }));

    const result = await useCase.execute({
      provider_name: "Proveedor Test",
      amount: "500.00",
      payment_method: "transfer",
    });

    expect(result.payment_method).toBe("transfer");
    expect(repo.create).toHaveBeenCalledWith({
      provider_name: "Proveedor Test",
      amount: "500.00",
      payment_method: "transfer",
    });
  });

  it("trim provider name", async () => {
    repo.create.mockResolvedValue(makePurchase());

    await useCase.execute({
      provider_name: "  Proveedor Test  ",
      amount: "500.00",
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ provider_name: "Proveedor Test" }),
    );
  });

  it("rejects empty provider name", async () => {
    await expect(
      useCase.execute({ provider_name: "   ", amount: "500.00" }),
    ).rejects.toThrow(ValidationError);

    await expect(
      useCase.execute({ provider_name: "", amount: "500.00" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects zero or negative amount", async () => {
    await expect(
      useCase.execute({ provider_name: "Test", amount: "0" }),
    ).rejects.toThrow(ValidationError);

    await expect(
      useCase.execute({ provider_name: "Test", amount: "-100.00" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects missing amount", async () => {
    await expect(
      useCase.execute({
        provider_name: "Test",
        amount: "",
      } as unknown as { provider_name: string; amount: string }),
    ).rejects.toThrow(ValidationError);
  });

  it("invalidates report cache after create", async () => {
    repo.create.mockResolvedValue(makePurchase());

    await useCase.execute({ provider_name: "Test", amount: "100.00" });

    expect(cache.deleteByPrefix).toHaveBeenCalledWith("reports:v1");
  });
});
