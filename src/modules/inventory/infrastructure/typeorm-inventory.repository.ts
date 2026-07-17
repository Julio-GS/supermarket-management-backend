import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, QueryRunner, Repository } from "typeorm";
import {
  InventoryRepositoryPort,
} from "../application/inventory.repository.port";
import { InventoryBalance, StockMovement, StockMovementType } from "../domain/inventory.entity";
import { InventoryBalanceEntity } from "./typeorm-inventory-balance.entity";
import { StockMovementEntity } from "./typeorm-stock-movement.entity";
import { TransactionRunnerPort } from "../../../shared/database/transaction-runner.port";

@Injectable()
export class TypeOrmInventoryRepository extends InventoryRepositoryPort {
  constructor(
    @InjectRepository(InventoryBalanceEntity)
    private readonly balanceRepo: Repository<InventoryBalanceEntity>,
    @InjectRepository(StockMovementEntity)
    private readonly movementRepo: Repository<StockMovementEntity>,
    private readonly transactionRunner: TransactionRunnerPort,
  ) {
    super();
  }

  async findBalance(productId: string): Promise<InventoryBalance | null> {
    const entity = await this.balanceRepo.findOne({
      where: { product_id: productId },
    });
    return entity ? this.toBalanceDomain(entity) : null;
  }

  async findAllBalances(): Promise<InventoryBalance[]> {
    const entities = await this.balanceRepo.find();
    return entities.map((e) => this.toBalanceDomain(e));
  }

  async findBalancesByIds(productIds: string[]): Promise<Map<string, InventoryBalance>> {
    if (productIds.length === 0) return new Map();
    const entities = await this.balanceRepo.find({
      where: { product_id: In(productIds) },
    });
    const map = new Map<string, InventoryBalance>();
    for (const entity of entities) {
      map.set(entity.product_id, this.toBalanceDomain(entity));
    }
    return map;
  }

  async createBalance(
    productId: string,
    stockActual: number,
    runner?: QueryRunner,
  ): Promise<InventoryBalance> {
    const balanceRepo = runner?.manager.getRepository(InventoryBalanceEntity) ?? this.balanceRepo;
    await balanceRepo
      .createQueryBuilder()
      .insert()
      .into(InventoryBalanceEntity)
      .values({ product_id: productId, stock_actual: stockActual })
      .orIgnore()
      .execute();
    const balance = await balanceRepo.findOneByOrFail({ product_id: productId });
    return this.toBalanceDomain(balance);
  }

  async adjustBalance(
    productId: string,
    delta: number,
    type: StockMovementType,
    referenceId?: string,
    reason?: string,
  ): Promise<StockMovement> {
    return this.transactionRunner.run(async (runner) => {
      const balanceRepo = runner.manager.getRepository(InventoryBalanceEntity);
      const movementRepo = runner.manager.getRepository(StockMovementEntity);
      const balance = await balanceRepo.findOne({
        where: { product_id: productId },
        lock: { mode: "pessimistic_write" },
      });
      if (!balance) {
        throw new Error(
          `Cannot adjust balance for product ${productId}: no balance exists`,
        );
      }

      const previousStock = balance.stock_actual;
      const newStock = previousStock + delta;
      balance.stock_actual = newStock;
      await balanceRepo.save(balance);

      const movement = movementRepo.create({
        product_id: productId,
        quantity: delta,
        type,
        reference_id: referenceId ?? null,
        previous_stock: previousStock,
        new_stock: newStock,
        reason: reason ?? null,
      });
      const saved = await movementRepo.save(movement);
      return this.toMovementDomain(saved);
    });
  }

  async findMovementsByProduct(productId: string): Promise<StockMovement[]> {
    const entities = await this.movementRepo.find({
      where: { product_id: productId },
      order: { created_at: "DESC" },
    });
    return entities.map((e) => this.toMovementDomain(e));
  }

  private toBalanceDomain(entity: InventoryBalanceEntity): InventoryBalance {
    const balance = new InventoryBalance();
    balance.product_id = entity.product_id;
    balance.stock_actual = entity.stock_actual;
    balance.updated_at = entity.updated_at;
    return balance;
  }

  private toMovementDomain(entity: StockMovementEntity): StockMovement {
    const movement = new StockMovement();
    movement.id = entity.id;
    movement.product_id = entity.product_id;
    movement.quantity = entity.quantity;
    movement.type = entity.type as StockMovementType;
    movement.reference_id = entity.reference_id;
    movement.previous_stock = entity.previous_stock;
    movement.new_stock = entity.new_stock;
    movement.reason = entity.reason;
    movement.created_at = entity.created_at;
    return movement;
  }
}
