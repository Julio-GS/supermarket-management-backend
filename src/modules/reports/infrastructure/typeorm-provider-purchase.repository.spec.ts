import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TypeOrmProviderPurchaseRepository } from "./typeorm-provider-purchase.repository";
import { TypeOrmProviderPurchaseEntity } from "./typeorm-provider-purchase.entity";

function makeEntityRow(overrides: Partial<TypeOrmProviderPurchaseEntity> = {}): TypeOrmProviderPurchaseEntity {
  const row = new TypeOrmProviderPurchaseEntity();
  Object.assign(row, {
    id: "purchase-1",
    provider_name: "Proveedor Test",
    amount: "500.00",
    payment_method: "cash",
    created_at: new Date("2026-07-01T12:00:00Z"),
    updated_at: new Date("2026-07-01T12:00:00Z"),
    ...overrides,
  });
  return row;
}

describe("TypeOrmProviderPurchaseRepository", () => {
  let repo: TypeOrmProviderPurchaseRepository;
  let typeormRepo: jest.Mocked<Repository<TypeOrmProviderPurchaseEntity>>;

  beforeEach(async () => {
    typeormRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<TypeOrmProviderPurchaseEntity>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TypeOrmProviderPurchaseRepository,
        {
          provide: getRepositoryToken(TypeOrmProviderPurchaseEntity),
          useValue: typeormRepo,
        },
      ],
    }).compile();

    repo = module.get(TypeOrmProviderPurchaseRepository);
  });

  describe("create", () => {
    it("creates and returns a domain object with payment method", async () => {
      const entityRow = makeEntityRow();
      typeormRepo.create.mockReturnValue(entityRow);
      typeormRepo.save.mockResolvedValue(entityRow);

      const result = await repo.create({
        provider_name: "Proveedor Test",
        amount: "500.00",
        payment_method: "cash",
      });

      expect(result.id).toBe("purchase-1");
      expect(result.provider_name).toBe("Proveedor Test");
      expect(result.amount).toBe("500.00");
      expect(result.payment_method).toBe("cash");
    });

    it("creates with null payment method when not provided", async () => {
      const entityRow = makeEntityRow({ payment_method: null });
      typeormRepo.create.mockReturnValue(entityRow);
      typeormRepo.save.mockResolvedValue(entityRow);

      const result = await repo.create({
        provider_name: "Test",
        amount: "100.00",
      });

      expect(result.payment_method).toBeNull();
    });
  });

  describe("findAll", () => {
    it("returns all purchases ordered by created_at DESC", async () => {
      typeormRepo.find.mockResolvedValue([
        makeEntityRow({ id: "1", provider_name: "Prov A" }),
        makeEntityRow({ id: "2", provider_name: "Prov B" }),
      ]);

      const result = await repo.findAll();

      expect(result).toHaveLength(2);
      expect(typeormRepo.find).toHaveBeenCalledWith({ order: { created_at: "DESC" } });
    });

    it("returns empty array when no records", async () => {
      typeormRepo.find.mockResolvedValue([]);

      const result = await repo.findAll();

      expect(result).toEqual([]);
    });
  });

  describe("findById", () => {
    it("returns domain object when entity exists", async () => {
      typeormRepo.findOne.mockResolvedValue(makeEntityRow());

      const result = await repo.findById("purchase-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("purchase-1");
    });

    it("returns null when entity does not exist", async () => {
      typeormRepo.findOne.mockResolvedValue(null);

      const result = await repo.findById("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("update", () => {
    it("updates and returns the updated domain object", async () => {
      typeormRepo.update.mockResolvedValue({ affected: 1 } as any);
      typeormRepo.findOneBy.mockResolvedValue(
        makeEntityRow({ provider_name: "Updated Prov", amount: "600.00" }),
      );

      const result = await repo.update("purchase-1", {
        provider_name: "Updated Prov",
        amount: "600.00",
      });

      expect(typeormRepo.update).toHaveBeenCalledWith("purchase-1", {
        provider_name: "Updated Prov",
        amount: "600.00",
      });
      expect(result.provider_name).toBe("Updated Prov");
      expect(result.amount).toBe("600.00");
    });

    it("allows setting payment_method to null", async () => {
      typeormRepo.update.mockResolvedValue({ affected: 1 } as any);
      typeormRepo.findOneBy.mockResolvedValue(makeEntityRow({ payment_method: null }));

      const result = await repo.update("purchase-1", { payment_method: null });

      expect(result.payment_method).toBeNull();
    });
  });

  describe("delete", () => {
    it("calls typeorm delete with the id", async () => {
      typeormRepo.delete.mockResolvedValue({ affected: 1 } as any);

      await repo.delete("purchase-1");

      expect(typeormRepo.delete).toHaveBeenCalledWith("purchase-1");
    });
  });

  describe("aggregateByProvider", () => {
    it("returns totals and breakdown for a window", async () => {
      const startsAt = new Date("2026-07-01T03:00:00.000Z");
      const endsAt = new Date("2026-07-02T02:59:59.999Z");

      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(),
        getRawMany: jest.fn(),
      };

      typeormRepo.createQueryBuilder.mockReturnValue(qb as any);

      qb.getRawOne
        .mockResolvedValueOnce({ amount: "1000.00" })  // total
        .mockResolvedValueOnce({ count: "5" });        // count

      qb.getRawMany.mockResolvedValue([
        { method: "cash", amount: "600.00" },
        { method: "transfer", amount: "400.00" },
      ]);

      const result = await repo.aggregateByProvider(startsAt, endsAt);

      expect(result.totalAmount).toBe("1000.00");
      expect(result.purchaseCount).toBe(5);
      expect(result.paymentMethodBreakdown).toEqual([
        { method: "cash", amount: "600.00" },
        { method: "transfer", amount: "400.00" },
      ]);
    });

    it("returns zero totals when no data", async () => {
      const startsAt = new Date("2026-07-01T03:00:00.000Z");
      const endsAt = new Date("2026-07-02T02:59:59.999Z");

      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(),
        getRawMany: jest.fn(),
      };

      typeormRepo.createQueryBuilder.mockReturnValue(qb as any);

      qb.getRawOne
        .mockResolvedValueOnce({ amount: "0" })
        .mockResolvedValueOnce({ count: "0" });

      qb.getRawMany.mockResolvedValue([]);

      const result = await repo.aggregateByProvider(startsAt, endsAt);

      expect(result.totalAmount).toBe("0");
      expect(result.purchaseCount).toBe(0);
      expect(result.paymentMethodBreakdown).toEqual([]);
    });
  });
});
