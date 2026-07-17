import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/infrastructure/jwt-auth.guard";
import { AdjustStockDto } from "./stock.dto";
import { GetStockUseCase, StockResponse } from "../application/get-stock.use-case";
import { AdjustStockUseCase } from "../application/adjust-stock.use-case";
import { StockMovement } from "../domain/inventory.entity";

@Controller("stock")
@UseGuards(JwtAuthGuard)
export class StockController {
  constructor(
    private readonly getStock: GetStockUseCase,
    private readonly adjustStock: AdjustStockUseCase,
  ) {}

  @Get(":product_id")
  async get(
    @Param("product_id", ParseUUIDPipe) productId: string,
  ): Promise<StockResponse> {
    return this.getStock.execute(productId);
  }

  @Post("adjust")
  async adjust(@Body() dto: AdjustStockDto): Promise<StockMovement> {
    return this.adjustStock.execute({
      product_id: dto.product_id,
      quantity: dto.quantity,
      reason: dto.reason,
    });
  }
}
