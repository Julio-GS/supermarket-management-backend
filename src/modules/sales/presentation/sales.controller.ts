import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../../auth/infrastructure/jwt-auth.guard";
import {
  CreateSaleDto,
  SaleResponseDto,
  SaleItemResponseDto,
} from "./sale.dto";
import { CreateSaleUseCase } from "../application/create-sale.use-case";
import { ListSalesUseCase } from "../application/list-sales.use-case";
import { GetSaleUseCase } from "../application/get-sale.use-case";
import { Sale } from "../domain/sale.entity";
import {
  hasPaginationQuery,
  normalizePagination,
  PaginationQueryDto,
} from "../../../shared/read-model/pagination.dto";
import { Page, mapPage } from "../../../shared/read-model/page";

interface AuthenticatedRequest extends Request {
  user: { sub: string; username: string };
}

function toSaleResponse(sale: Sale): SaleResponseDto {
  return {
    id: sale.id,
    user_id: sale.user_id,
    total: sale.total,
    items: sale.items.map(
      (item): SaleItemResponseDto => ({
        id: item.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
      }),
    ),
    invoice_status: sale.invoice_status,
    cae: sale.cae ?? null,
    cae_vto: sale.cae_vto ?? null,
    cbte_nro: sale.cbte_nro ?? null,
    cbte_tipo: sale.cbte_tipo ?? null,
    pto_vta: sale.pto_vta ?? null,
    invoice_requested_at: sale.invoice_requested_at ?? null,
    created_at: sale.created_at,
    updated_at: sale.updated_at,
  };
}

@Controller("sales")
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(
    private readonly createSale: CreateSaleUseCase,
    private readonly listSales: ListSalesUseCase,
    private readonly getSale: GetSaleUseCase,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateSaleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SaleResponseDto> {
    const sale = await this.createSale.execute({
      user_id: req.user.sub,
      items: dto.items,
      invoice_requested: dto.invoice_requested,
    });
    return toSaleResponse(sale);
  }

  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginationQueryDto,
  ): Promise<SaleResponseDto[] | Page<SaleResponseDto>> {
    if (hasPaginationQuery(query)) {
      const page = await this.listSales.executePage(
        req.user.sub,
        normalizePagination(query),
      );
      return mapPage(page, toSaleResponse);
    }
    const sales = await this.listSales.execute(req.user.sub);
    return sales.map(toSaleResponse);
  }

  @Get(":id")
  async get(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<SaleResponseDto> {
    const sale = await this.getSale.execute(id, req.user.sub);
    return toSaleResponse(sale);
  }
}
