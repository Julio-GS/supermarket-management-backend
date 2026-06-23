import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  SaleRepositoryPort,
  SaleCreateInput,
  SaleReadOptions,
} from "../application/sale.repository.port";
import { Sale, SaleItem } from "../domain/sale.entity";
import { SaleEntity } from "./typeorm-sale.entity";
import { SaleItemEntity } from "./typeorm-sale-item.entity";
import { createPage, Page } from "../../../shared/read-model/page";
import {
  offsetFor,
  parseSort,
} from "../../../shared/read-model/pagination.dto";
import { saleProjection } from "../../../shared/read-model/projection";

const SALE_SORT_FIELDS = ["created_at", "updated_at", "total"] as const;

@Injectable()
export class TypeOrmSaleRepository extends SaleRepositoryPort {
  constructor(
    @InjectRepository(SaleEntity)
    private readonly saleRepo: Repository<SaleEntity>,
    @InjectRepository(SaleItemEntity)
    private readonly itemRepo: Repository<SaleItemEntity>,
  ) {
    super();
  }

  async create(input: SaleCreateInput): Promise<Sale> {
    const sale = this.saleRepo.create({
      user_id: input.user_id,
      total: input.total,
      invoice_status: input.invoice_status,
      cae: input.cae ?? null,
      cae_vto: input.cae_vto ?? null,
      cbte_nro: input.cbte_nro ?? null,
      cbte_tipo: input.cbte_tipo ?? null,
      pto_vta: input.pto_vta ?? null,
      invoice_requested_at: input.invoice_requested_at ?? null,
      items: input.items.map((item) => this.itemRepo.create(item)),
    });
    const saved = await this.saleRepo.save(sale);
    return this.toDomain(saved);
  }

  async findByUser(user_id: string): Promise<Sale[]> {
    const entities = await this.baseUserQuery(user_id)
      .orderBy("sale.created_at", "DESC")
      .getMany();
    return entities.map((e) => this.toDomain(e));
  }

  async findPageByUser(
    user_id: string,
    options: SaleReadOptions,
  ): Promise<Page<Sale>> {
    const sort = parseSort(options.sort, SALE_SORT_FIELDS, {
      field: "created_at",
      direction: "DESC",
    });
    const [entities, total] = await this.baseUserQuery(user_id)
      .orderBy(`sale.${sort.field}`, sort.direction)
      .skip(offsetFor(options))
      .take(options.limit)
      .getManyAndCount();

    return createPage(
      entities.map((e) => this.toDomain(e)),
      total,
      options,
    );
  }

  async findByIdForUser(id: string, user_id: string): Promise<Sale | null> {
    const entity = await this.saleRepo.findOne({
      where: { id, user_id },
      relations: ["items"],
    });
    return entity ? this.toDomain(entity) : null;
  }

  private baseUserQuery(user_id: string) {
    return this.saleRepo
      .createQueryBuilder("sale")
      .select(saleProjection.list.map((field) => `sale.${field}`))
      .leftJoin("sale.items", "item")
      .addSelect([
        "item.id",
        "item.sale_id",
        "item.product_id",
        "item.quantity",
        "item.unit_price",
        "item.subtotal",
      ])
      .where("sale.user_id = :user_id", { user_id });
  }

  private toDomain(entity: SaleEntity): Sale {
    const sale = new Sale();
    sale.id = entity.id;
    sale.user_id = entity.user_id;
    sale.total = entity.total;
    sale.invoice_status = entity.invoice_status as Sale["invoice_status"];
    sale.cae = entity.cae;
    sale.cae_vto = entity.cae_vto;
    sale.cbte_nro = entity.cbte_nro;
    sale.cbte_tipo = entity.cbte_tipo;
    sale.pto_vta = entity.pto_vta;
    sale.invoice_requested_at = entity.invoice_requested_at;
    sale.items = (entity.items ?? []).map((i) => {
      const item = new SaleItem();
      item.id = i.id;
      item.sale_id = i.sale_id;
      item.product_id = i.product_id;
      item.quantity = i.quantity;
      item.unit_price = i.unit_price;
      item.subtotal = i.subtotal;
      return item;
    });
    sale.created_at = entity.created_at;
    sale.updated_at = entity.updated_at;
    return sale;
  }
}
