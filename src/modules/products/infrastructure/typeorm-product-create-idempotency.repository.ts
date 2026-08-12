import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryRunner, Repository } from "typeorm";
import {
  ProductCreateIdempotencyRepositoryPort,
  ProductCreateIdempotencyRecord,
  CreateIdempotencyInput,
} from "../application/product-create-idempotency.repository.port";
import { ProductCreateIdempotencyEntity } from "./typeorm-product-create-idempotency.entity";

@Injectable()
export class TypeOrmProductCreateIdempotencyRepository extends ProductCreateIdempotencyRepositoryPort {
  constructor(
    @InjectRepository(ProductCreateIdempotencyEntity)
    private readonly repo: Repository<ProductCreateIdempotencyEntity>,
  ) {
    super();
  }

  async findByKey(
    idempotencyKey: string,
    runner?: QueryRunner,
  ): Promise<ProductCreateIdempotencyRecord | null> {
    const repository = runner?.manager.getRepository(ProductCreateIdempotencyEntity) ?? this.repo;
    const entity = await repository.findOne({
      where: { idempotency_key: idempotencyKey },
    });
    return entity ? this.toRecord(entity) : null;
  }

  async create(
    input: CreateIdempotencyInput,
    runner?: QueryRunner,
  ): Promise<ProductCreateIdempotencyRecord> {
    const repository = runner?.manager.getRepository(ProductCreateIdempotencyEntity) ?? this.repo;
    const entity = repository.create({
      idempotency_key: input.idempotencyKey,
      payload_version: input.payloadVersion,
      payload_hash: input.payloadHash,
      product_id: input.productId,
      label_job_id: input.labelJobId,
      response_status: 201,
      response_body: input.responseBody,
    });
    const saved = await repository.save(entity);
    return this.toRecord(saved);
  }

  private toRecord(entity: ProductCreateIdempotencyEntity): ProductCreateIdempotencyRecord {
    return {
      id: entity.id,
      idempotency_key: entity.idempotency_key,
      payload_version: entity.payload_version,
      payload_hash: entity.payload_hash,
      product_id: entity.product_id,
      label_job_id: entity.label_job_id,
      response_status: entity.response_status,
      response_body: entity.response_body,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };
  }
}
