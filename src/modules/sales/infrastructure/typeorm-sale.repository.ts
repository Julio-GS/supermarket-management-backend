import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  SaleRepositoryPort,
  SaleCreateInput,
} from "../application/sale.repository.port";
import { Sale, SaleItem } from "../domain/sale.entity";
import { SaleEntity } from "./typeorm-sale.entity";
import { SaleItemEntity } from "./typeorm-sale-item.entity";

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
    const entities = await this.saleRepo.find({
      where: { user_id },
      relations: ["items"],
      order: { created_at: "DESC" },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findByIdForUser(id: string, user_id: string): Promise<Sale | null> {
    const entity = await this.saleRepo.findOne({
      where: { id, user_id },
      relations: ["items"],
    });
    return entity ? this.toDomain(entity) : null;
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
