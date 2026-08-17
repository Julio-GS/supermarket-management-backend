export interface StockProductLookupResult {
  id: string;
  maneja_stock: boolean;
}

export abstract class StockProductLookupPort {
  abstract findById(id: string): Promise<StockProductLookupResult | null>;
}
