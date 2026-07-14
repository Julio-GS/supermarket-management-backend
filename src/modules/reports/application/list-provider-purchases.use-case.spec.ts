import { ListProviderPurchasesUseCase } from "./list-provider-purchases.use-case";
import { ProviderPurchaseRepositoryPort } from "./provider-purchase.repository.port";

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

describe("ListProviderPurchasesUseCase", () => {
  let repo: jest.Mocked<ProviderPurchaseRepositoryPort>;
  let useCase: ListProviderPurchasesUseCase;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregateByProvider: jest.fn(),
    } as unknown as jest.Mocked<ProviderPurchaseRepositoryPort>;

    useCase = new ListProviderPurchasesUseCase(repo);
  });

  it("returns all purchases when records exist", async () => {
    repo.findAll.mockResolvedValue([
      makePurchase({ id: "1", provider_name: "Prov A" }),
      makePurchase({ id: "2", provider_name: "Prov B" }),
    ]);

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(result[0].provider_name).toBe("Prov A");
    expect(result[1].provider_name).toBe("Prov B");
  });

  it("returns empty array when no records exist", async () => {
    repo.findAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
