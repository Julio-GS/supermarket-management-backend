import { Repository } from "typeorm";
import { TransactionRunnerPort } from "../../../shared/database/transaction-runner.port";
import { InventoryBalanceEntity } from "./typeorm-inventory-balance.entity";
import { StockMovementEntity } from "./typeorm-stock-movement.entity";
import { TypeOrmInventoryRepository } from "./typeorm-inventory.repository";

describe("TypeOrmInventoryRepository", () => {
  it("creates balances idempotently for retries", async () => {
    const query = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    const balance = {
      product_id: "product-1",
      stock_actual: 0,
      updated_at: new Date(),
    } as InventoryBalanceEntity;
    const balanceRepo = {
      createQueryBuilder: jest.fn(() => query),
      findOneByOrFail: jest.fn().mockResolvedValue(balance),
    };
    const repository = new TypeOrmInventoryRepository(
      balanceRepo as unknown as Repository<InventoryBalanceEntity>,
      {} as Repository<StockMovementEntity>,
      {} as TransactionRunnerPort,
    );

    await repository.createBalance("product-1", 0);
    await repository.createBalance("product-1", 0);

    expect(query.orIgnore).toHaveBeenCalledTimes(2);
    expect(balanceRepo.findOneByOrFail).toHaveBeenCalledWith({
      product_id: "product-1",
    });
  });

  it("locks the balance and persists its adjustment and movement in one transaction", async () => {
    const balance = { product_id: "product-1", stock_actual: 20 } as InventoryBalanceEntity;
    const balanceRepo = { findOne: jest.fn().mockResolvedValue(balance), save: jest.fn() };
    const movementRepo = {
      create: jest.fn((input) => ({ id: "movement-1", created_at: new Date(), ...input })),
      save: jest.fn((movement) => Promise.resolve(movement)),
    };
    const transactionRunner: Pick<TransactionRunnerPort, "run"> = {
      run: jest.fn((work) => work({ manager: { getRepository: jest.fn((entity) =>
        entity === InventoryBalanceEntity ? balanceRepo : movementRepo) } } as never)),
    };
    const repository = new TypeOrmInventoryRepository(
      {} as Repository<InventoryBalanceEntity>, {} as Repository<StockMovementEntity>,
      transactionRunner as TransactionRunnerPort,
    );

    const movement = await repository.adjustBalance("product-1", -5, "adjustment", undefined, "damaged");

    expect(transactionRunner.run).toHaveBeenCalledTimes(1);
    expect(balanceRepo.findOne).toHaveBeenCalledWith({
      where: { product_id: "product-1" }, lock: { mode: "pessimistic_write" },
    });
    expect(balance.stock_actual).toBe(15);
    expect(movementRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      previous_stock: 20, new_stock: 15, quantity: -5,
    }));
    expect(movement.new_stock).toBe(15);
  });
});
