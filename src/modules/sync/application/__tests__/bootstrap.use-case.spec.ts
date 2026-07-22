import { Test, TestingModule } from "@nestjs/testing";
import { BootstrapUseCase } from "../bootstrap.use-case";
import { ProductRepositoryPort } from "../../../products/application/product.repository.port";
import { InventoryRepositoryPort } from "../../../inventory/application/inventory.repository.port";
import { PromotionRepositoryPort } from "../../../promotions/application/promotion.repository.port";
import { ProviderPurchaseRepositoryPort } from "../../../reports/application/provider-purchase.repository.port";
import { UserRepositoryPort } from "../../../users/application/user.repository.port";
import { Product } from "../../../products/domain/product.entity";
import { InventoryBalance } from "../../../inventory/domain/inventory.entity";
import { Promotion } from "../../../promotions/domain/promotion.entity";
import { ProviderPurchase } from "../../../reports/domain/provider-purchase.entity";
import { User } from "../../../users/domain/user.entity";

const mockProductRepo = {
  findAll: jest.fn(),
};
const mockInventoryRepo = {
  findAllBalances: jest.fn(),
};
const mockPromotionRepo = {
  findAll: jest.fn(),
};
const mockProviderPurchaseRepo = {
  findAll: jest.fn(),
};
const mockUserRepo = {
  findById: jest.fn(),
};

describe("BootstrapUseCase", () => {
  let useCase: BootstrapUseCase;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BootstrapUseCase,
        { provide: ProductRepositoryPort, useValue: mockProductRepo },
        { provide: InventoryRepositoryPort, useValue: mockInventoryRepo },
        { provide: PromotionRepositoryPort, useValue: mockPromotionRepo },
        { provide: ProviderPurchaseRepositoryPort, useValue: mockProviderPurchaseRepo },
        { provide: UserRepositoryPort, useValue: mockUserRepo },
      ],
    }).compile();

    useCase = module.get(BootstrapUseCase);

    jest.clearAllMocks();
  });

  describe("execute", () => {
    it("returns a complete bootstrap snapshot with products, stock, promotions, provider purchases, and user profile", async () => {
      const userId = "user-1";
      const product: Product = {
        id: "p-1",
        detalle: "Test Product",
        costo_neto: "10.00",
        costo_final: "12.10",
        iva: "21.00",
        cambio_costo: "fixed",
        cambio_precio: "fixed",
        etiqueta: "Test",
        facturable: true,
        maneja_stock: true,
        codigos: ["123"],
        pricing_mode: "fixed" as const,
        is_protected: false,
        created_at: new Date("2024-01-01"),
        updated_at: new Date("2024-01-02"),
      };

      const balances: InventoryBalance[] = [
        { product_id: "p-1", stock_actual: 50, updated_at: new Date("2024-01-02") },
      ];

      const promotion: Promotion = {
        id: "promo-1",
        name: "Test Promo",
        description: null,
        scope: "store" as const,
        product_id: null,
        type: "percentage" as const,
        discount_percent: 10,
        start_date: null,
        end_date: null,
        weekdays: null,
        enabled: true,
        created_at: new Date("2024-01-01"),
        updated_at: new Date("2024-01-01"),
      };

      const providerPurchase: ProviderPurchase = {
        id: "pp-1",
        provider_name: "Provider Co",
        amount: "500.00",
        payment_method: "transfer",
        created_at: new Date("2024-01-01"),
        updated_at: new Date("2024-01-01"),
      };

      const user: User = {
        id: "user-1",
        username: "cashier1",
        password_hash: "hashed",
        created_at: new Date("2024-01-01"),
        updated_at: new Date("2024-01-01"),
      };

      mockProductRepo.findAll.mockResolvedValue([product]);
      mockInventoryRepo.findAllBalances.mockResolvedValue(balances);
      mockPromotionRepo.findAll.mockResolvedValue([promotion]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([providerPurchase]);
      mockUserRepo.findById.mockResolvedValue(user);

      const snapshot = await useCase.execute(userId);

      expect(snapshot).toBeDefined();
      expect(snapshot.products).toHaveLength(1);
      expect(snapshot.products[0].id).toBe("p-1");

      expect(snapshot.stock_balances).toHaveLength(1);
      expect(snapshot.stock_balances[0].product_id).toBe("p-1");

      expect(snapshot.promotions).toHaveLength(1);
      expect(snapshot.promotions[0].id).toBe("promo-1");

      expect(snapshot.provider_purchases).toHaveLength(1);
      expect(snapshot.provider_purchases[0].id).toBe("pp-1");

      expect(snapshot.user_profile).toBeDefined();
      expect(snapshot.user_profile.id).toBe("user-1");
      expect(snapshot.user_profile.username).toBe("cashier1");

      // User profile must NOT include password_hash
      expect((snapshot.user_profile as unknown as Record<string, unknown>).password_hash).toBeUndefined();
    });

    it("returns an empty snapshot when there is no operational data", async () => {
      mockProductRepo.findAll.mockResolvedValue([]);
      mockInventoryRepo.findAllBalances.mockResolvedValue([]);
      mockPromotionRepo.findAll.mockResolvedValue([]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([]);
      mockUserRepo.findById.mockResolvedValue({
        id: "user-1",
        username: "newbie",
        password_hash: "hashed",
        created_at: new Date(),
        updated_at: new Date(),
      });

      const snapshot = await useCase.execute("user-1");

      expect(snapshot.products).toHaveLength(0);
      expect(snapshot.stock_balances).toHaveLength(0);
      expect(snapshot.promotions).toHaveLength(0);
      expect(snapshot.provider_purchases).toHaveLength(0);
      expect(snapshot.user_profile.username).toBe("newbie");
    });

    it("includes a sync cursor as an ISO-8601 timestamp", async () => {
      mockProductRepo.findAll.mockResolvedValue([]);
      mockInventoryRepo.findAllBalances.mockResolvedValue([]);
      mockPromotionRepo.findAll.mockResolvedValue([]);
      mockProviderPurchaseRepo.findAll.mockResolvedValue([]);
      mockUserRepo.findById.mockResolvedValue({
        id: "user-1",
        username: "u",
        password_hash: "h",
        created_at: new Date(),
        updated_at: new Date(),
      });

      const snapshot = await useCase.execute("user-1");

      expect(snapshot.sync_cursor).toBeDefined();
      // Must be a valid ISO-8601 timestamp
      expect(new Date(snapshot.sync_cursor).toISOString()).toBe(snapshot.sync_cursor);
    });

    it("throws when the user does not exist", async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(useCase.execute("nonexistent")).rejects.toThrow(
        /user/i,
      );
    });

    it("propagates repository errors without swallowing them", async () => {
      mockUserRepo.findById.mockResolvedValue({
        id: "user-1",
        username: "u",
        password_hash: "h",
        created_at: new Date(),
        updated_at: new Date(),
      });
      mockProductRepo.findAll.mockRejectedValue(new Error("DB down"));

      await expect(useCase.execute("user-1")).rejects.toThrow("DB down");
    });
  });
});
