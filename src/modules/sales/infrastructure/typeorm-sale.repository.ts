import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import {
  SaleRepositoryPort,
  SaleCreateInput,
  SaleReadOptions,
} from "../application/sale.repository.port";
import { ArcaInvoiceResult } from "../application/arca-invoice.port";
import {
  InvoiceStatus,
  PAYMENT_METHODS,
  PaymentMethod,
  PaymentMethodAllocation,
  Sale,
  SaleItem,
  SaleSplitTicketGroup,
  SaleSplitTicketGroupInput,
} from "../domain/sale.entity";
import { SaleEntity } from "./typeorm-sale.entity";
import { SaleItemEntity } from "./typeorm-sale-item.entity";
import { SalePaymentMethodEntity } from "./typeorm-sale-payment-method.entity";
import { SaleTicketAllocationEntity } from "./typeorm-sale-ticket-allocation.entity";
import { createPage, Page } from "../../../shared/read-model/page";
import {
  offsetFor,
  parseSort,
} from "../../../shared/read-model/pagination.dto";
import { saleProjection } from "../../../shared/read-model/projection";
import { Money } from "../../../shared/money/money.helper";
import { ValidationError } from "../../../shared/errors/domain.error";

const SALE_SORT_FIELDS = ["created_at", "updated_at", "total"] as const;
const PAYMENT_METHOD_ORDER = new Map<PaymentMethod, number>(
  PAYMENT_METHODS.map((method, index) => [method, index]),
);

function sortPaymentMethodAllocations(
  allocations: PaymentMethodAllocation[],
): PaymentMethodAllocation[] {
  return [...allocations].sort(
    (a, b) => PAYMENT_METHOD_ORDER.get(a.method)! - PAYMENT_METHOD_ORDER.get(b.method)!,
  );
}

function buildSplitTicketAllocations(
  saleId: string,
  saleItems: SaleItemEntity[],
  groups: SaleSplitTicketGroupInput[] | null | undefined,
  createAllocation: (
    input: Pick<
      SaleTicketAllocationEntity,
      "sale_id" | "sale_item_id" | "ticket_group_label" | "quantity"
    >,
  ) => SaleTicketAllocationEntity,
): SaleTicketAllocationEntity[] {
  if (!Array.isArray(groups) || groups.length === 0) {
    return [];
  }

  const allocations: SaleTicketAllocationEntity[] = [];
  const remainingByItemId = new Map(
    saleItems.map((item) => [item.id, item.quantity]),
  );
  const itemsByProduct = new Map<string, SaleItemEntity[]>();

  for (const item of saleItems) {
    const pid = item.product_id ?? "";
    const currentItems = itemsByProduct.get(pid) ?? [];
    currentItems.push(item);
    itemsByProduct.set(pid, currentItems);
  }

  for (const group of groups) {
    for (const groupItem of group.items) {
      const itemsForProduct = itemsByProduct.get(groupItem.product_id);
      if (!itemsForProduct || itemsForProduct.length === 0) {
        throw new ValidationError(
          `Split ticket references unknown product ${groupItem.product_id}`,
        );
      }

      let remaining = groupItem.quantity;

      for (const saleItem of itemsForProduct) {
        if (remaining === 0) {
          break;
        }

        const available = remainingByItemId.get(saleItem.id) ?? 0;
        if (available <= 0) {
          continue;
        }

        const allocated = Math.min(available, remaining);
        allocations.push(
          createAllocation({
            sale_id: saleId,
            sale_item_id: saleItem.id,
            ticket_group_label: group.label,
            quantity: allocated,
          }),
        );

        remainingByItemId.set(saleItem.id, available - allocated);
        remaining -= allocated;
      }

      if (remaining > 0) {
        throw new ValidationError(
          `Split ticket allocation for product ${groupItem.product_id} must match the ordered quantity`,
        );
      }
    }
  }

  for (const remaining of remainingByItemId.values()) {
    if (remaining !== 0) {
      throw new ValidationError(
        "Split ticket allocation must cover every sale item quantity",
      );
    }
  }

  return allocations;
}

function buildSplitTicketGroups(entity: SaleEntity): SaleSplitTicketGroup[] | null {
  const allocations = entity.split_ticket_allocations ?? [];
  if (allocations.length === 0) {
    return null;
  }

  const itemsById = new Map((entity.items ?? []).map((item) => [item.id, item]));
  const groups = new Map<
    string,
    {
      label: string;
      items: Map<
        string,
        {
          product_id: string;
          quantity: number;
          unit_price: string;
          subtotal: ReturnType<typeof Money.parse>;
        }
      >;
    }
  >();

  for (const allocation of allocations) {
    const saleItem = itemsById.get(allocation.sale_item_id);
    if (!saleItem) {
      continue;
    }

    const currentGroup =
      groups.get(allocation.ticket_group_label) ??
      ({
        label: allocation.ticket_group_label,
        items: new Map(),
      } as const);

    const group = groups.get(allocation.ticket_group_label) ?? {
      label: currentGroup.label,
      items: new Map(),
    };

    const itemKey = `${saleItem.product_id}:${saleItem.unit_price}`;
    const existingItem =
      group.items.get(itemKey) ??
      {
        product_id: saleItem.product_id,
        quantity: 0,
        unit_price: saleItem.unit_price,
        subtotal: Money.zero(),
      };

    existingItem.quantity += allocation.quantity;
    existingItem.subtotal = Money.add(
      existingItem.subtotal,
      Money.multiply(Money.parse(saleItem.unit_price), allocation.quantity),
    );

    group.items.set(itemKey, existingItem);
    groups.set(allocation.ticket_group_label, group);
  }

  return [...groups.values()]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((group) => ({
      label: group.label,
      items: [...group.items.values()]
        .sort((left, right) =>
          left.product_id.localeCompare(right.product_id) ||
          left.unit_price.localeCompare(right.unit_price),
        )
        .map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: Money.toString(item.subtotal),
        })),
    }));
}

@Injectable()
export class TypeOrmSaleRepository extends SaleRepositoryPort {
  constructor(
    @InjectRepository(SaleEntity)
    private readonly saleRepo: Repository<SaleEntity>,
    @InjectRepository(SaleItemEntity)
    private readonly itemRepo: Repository<SaleItemEntity>,
    @InjectRepository(SalePaymentMethodEntity)
    private readonly paymentMethodRepo: Repository<SalePaymentMethodEntity>,
    @InjectRepository(SaleTicketAllocationEntity)
    private readonly ticketAllocationRepo: Repository<SaleTicketAllocationEntity>,
  ) {
    super();
  }

  async create(input: SaleCreateInput): Promise<Sale> {
    const saleId = randomUUID();
    const saleItems = input.items.map((item) =>
      this.itemRepo.create({
        id: randomUUID(),
        ...item,
        applied_promotions: item.applied_promotions ?? [],
      }),
    );

    const sale = this.saleRepo.create({
      id: saleId,
      user_id: input.user_id,
      total: input.total,
      invoice_status: input.invoice_status,
      manual_discount_amount: input.manual_discount_amount ?? null,
      manual_discount_modality: input.manual_discount_modality ?? null,
      manual_discount_percentage: input.manual_discount_percentage ?? null,
      payment_methods: input.payment_methods.map((allocation) =>
        this.paymentMethodRepo.create({
          method: allocation.method,
          amount: allocation.amount,
        }),
      ),
      split_ticket_allocations: buildSplitTicketAllocations(
        saleId,
        saleItems,
        input.split_ticket_groups,
        (allocation) => this.ticketAllocationRepo.create(allocation),
      ),
      cae: input.cae ?? null,
      cae_vto: input.cae_vto ?? null,
      cbte_nro: input.cbte_nro ?? null,
      cbte_tipo: input.cbte_tipo ?? null,
      pto_vta: input.pto_vta ?? null,
      invoice_requested_at: input.invoice_requested_at ?? null,
      items: saleItems,
    });

    const saved = await this.saleRepo.save(sale);

    if (
      (input.split_ticket_groups?.length ?? 0) > 0 &&
      !(saved.split_ticket_allocations?.length ?? 0)
    ) {
      const loaded = await this.saleRepo.findOne({
        where: { id: saved.id },
        relations: ["items", "payment_methods", "split_ticket_allocations"],
      });
      return this.toDomain(loaded ?? saved);
    }

    return this.toDomain(saved);
  }

  async findByUser(user_id: string): Promise<Sale[]> {
    const entities = await this.baseUserQuery(user_id)
      .orderBy("sale.created_at", "DESC")
      .getMany();
    return entities.map((entity) => this.toDomain(entity));
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
      entities.map((entity) => this.toDomain(entity)),
      total,
      options,
    );
  }

  async findByIdForUser(id: string, user_id: string): Promise<Sale | null> {
    const entity = await this.saleRepo.findOne({
      where: { id, user_id },
      relations: ["items", "payment_methods", "split_ticket_allocations"],
    });
    return entity ? this.toDomain(entity) : null;
  }

  async findByIdForUserForUpdate(
    id: string,
    user_id: string,
    manager?: EntityManager,
  ): Promise<Sale | null> {
    const repo = manager
      ? manager.getRepository(SaleEntity)
      : this.saleRepo;

    const entity = await repo.findOne({
      where: { id, user_id },
      lock: { mode: "pessimistic_write" },
      relations: ["items", "payment_methods", "split_ticket_allocations"],
    });

    return entity ? this.toDomain(entity) : null;
  }

  async markInvoiceIssued(
    id: string,
    user_id: string,
    invoiceResult: ArcaInvoiceResult,
    manager?: EntityManager,
  ): Promise<Sale> {
    const repo = manager
      ? manager.getRepository(SaleEntity)
      : this.saleRepo;

    await repo.update(
      { id, user_id },
      {
        invoice_status: "issued",
        cae: invoiceResult.cae,
        cae_vto: invoiceResult.cae_vto,
        cbte_nro: invoiceResult.cbte_nro,
        cbte_tipo: invoiceResult.cbte_tipo,
        pto_vta: invoiceResult.pto_vta,
      },
    );

    // Re-read full entity to return the updated domain object
    const updated = await repo.findOne({
      where: { id, user_id },
      relations: ["items", "payment_methods", "split_ticket_allocations"],
    });

    if (!updated) {
      throw new Error(
        `Sale ${id} not found after marking invoice as issued`,
      );
    }

    return this.toDomain(updated);
  }

  async transitionInvoiceStatus(
    id: string,
    user_id: string,
    expectedStatus: InvoiceStatus,
    nextStatus: InvoiceStatus,
    fiscalFields?: {
      cae: string;
      cae_vto: string;
      cbte_nro: number;
      cbte_tipo: number;
      pto_vta: number;
    },
    manager?: EntityManager,
  ): Promise<Sale | null> {
    const repo = manager
      ? manager.getRepository(SaleEntity)
      : this.saleRepo;

    // Lock + check current status
    const entity = await repo.findOne({
      where: { id, user_id },
      lock: { mode: "pessimistic_write" },
    });

    if (!entity || entity.invoice_status !== expectedStatus) {
      return null;
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      invoice_status: nextStatus,
    };

    if (fiscalFields) {
      updateData.cae = fiscalFields.cae;
      updateData.cae_vto = fiscalFields.cae_vto;
      updateData.cbte_nro = fiscalFields.cbte_nro;
      updateData.cbte_tipo = fiscalFields.cbte_tipo;
      updateData.pto_vta = fiscalFields.pto_vta;
    } else {
      // When not setting fiscal fields (e.g. failed→issuing, issuing→failed,
      // issuing→ambiguous), explicitly null them out to keep the row consistent.
      updateData.cae = null;
      updateData.cae_vto = null;
      updateData.cbte_nro = null;
      updateData.cbte_tipo = null;
      updateData.pto_vta = null;
    }

    await repo.update({ id, user_id }, updateData as any);

    // Re-read full entity to return updated domain object
    const updated = await repo.findOne({
      where: { id, user_id },
      relations: ["items", "payment_methods", "split_ticket_allocations"],
    });

    return updated ? this.toDomain(updated) : null;
  }

  private baseUserQuery(user_id: string) {
    return this.saleRepo
      .createQueryBuilder("sale")
      .select(saleProjection.list.map((field) => `sale.${field}`))
      .leftJoin("sale.items", "item")
      .leftJoin("sale.payment_methods", "payment_method")
      .leftJoin("sale.split_ticket_allocations", "split_ticket_allocation")
      .addSelect([
        "item.id",
        "item.sale_id",
        "item.product_id",
        "item.name",
        "item.description",
        "item.iva",
        "item.quantity",
        "item.unit_price",
        "item.subtotal",
        "item.discount_amount",
        "item.applied_promotions",
        "item.applied_promotion_id",
        "item.applied_promotion_type",
      ])
      .addSelect([
        "payment_method.id",
        "payment_method.sale_id",
        "payment_method.method",
        "payment_method.amount",
      ])
      .addSelect([
        "split_ticket_allocation.id",
        "split_ticket_allocation.sale_id",
        "split_ticket_allocation.sale_item_id",
        "split_ticket_allocation.ticket_group_label",
        "split_ticket_allocation.quantity",
      ])
      .where("sale.user_id = :user_id", { user_id });
  }

  private toDomain(entity: SaleEntity): Sale {
    const sale = new Sale();
    sale.id = entity.id;
    sale.user_id = entity.user_id;
    sale.total = entity.total;
    sale.payment_methods = sortPaymentMethodAllocations(
      (entity.payment_methods ?? []).map(
        (paymentMethod) => ({
          method: paymentMethod.method,
          amount: paymentMethod.amount,
        }),
      ),
    );
    sale.split_ticket_groups = buildSplitTicketGroups(entity);
    sale.invoice_status = entity.invoice_status as Sale["invoice_status"];
    sale.manual_discount_amount = entity.manual_discount_amount ?? null;
    sale.manual_discount_modality =
      (entity.manual_discount_modality as Sale["manual_discount_modality"]) ?? null;
    sale.manual_discount_percentage = entity.manual_discount_percentage ?? null;
    sale.cae = entity.cae;
    sale.cae_vto = entity.cae_vto;
    sale.cbte_nro = entity.cbte_nro;
    sale.cbte_tipo = entity.cbte_tipo;
    sale.pto_vta = entity.pto_vta;
    sale.invoice_requested_at = entity.invoice_requested_at;
    sale.items = (entity.items ?? []).map((saleItem) => {
      const item = new SaleItem();
      item.id = saleItem.id;
      item.sale_id = saleItem.sale_id;
      item.product_id = saleItem.product_id;
      item.name = saleItem.name ?? null;
      item.description = saleItem.description ?? null;
      item.iva = saleItem.iva ?? null;
      item.quantity = saleItem.quantity;
        item.unit_price = saleItem.unit_price;
        item.subtotal = saleItem.subtotal;
        item.discount_amount = saleItem.discount_amount ?? "0.00";
        item.applied_promotions = saleItem.applied_promotions ?? [];
        item.applied_promotion_id = saleItem.applied_promotion_id ?? null;
        item.applied_promotion_type = saleItem.applied_promotion_type ?? null;
        return item;
      });
    sale.created_at = entity.created_at;
    sale.updated_at = entity.updated_at;
    return sale;
  }
}
