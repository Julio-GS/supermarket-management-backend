import { SaleSyncHandler } from '../sale-sync.handler';
import { SaleRepositoryPort } from '../../../../sales/application/sale.repository.port';
import { Sale } from '../../../../sales/domain/sale.entity';
import { SaleCreateEntry } from '../../../domain/sync-payloads';

describe('SaleSyncHandler', () => {
  let handler: SaleSyncHandler;
  let saleRepo: jest.Mocked<SaleRepositoryPort>;

  beforeEach(() => {
    saleRepo = {
      create: jest.fn(),
      findByUser: jest.fn(),
      findPageByUser: jest.fn(),
      findByIdForUser: jest.fn(),
      findByIdForUserForUpdate: jest.fn(),
      markInvoiceIssued: jest.fn(),
      transitionInvoiceStatus: jest.fn(),
    } as unknown as jest.Mocked<SaleRepositoryPort>;

    handler = new SaleSyncHandler(saleRepo);
  });

  it('should declare supportedOperations containing sale_create', () => {
    expect(handler.supportedOperations).toBeInstanceOf(Set);
    expect(handler.supportedOperations.has('sale_create')).toBe(true);
    expect(handler.supportedOperations.size).toBe(1);
  });

  describe('sale_create', () => {
    it('should create sale with mapped items, payments, actor user and return accepted result with server_id', async () => {
      const entry: SaleCreateEntry = {
        id: 'entry-sale-1',
        idempotency_key: 'idem-sale-1',
        operation_type: 'sale_create',
        aggregate_type: 'sale',
        aggregate_id: 'sale-client-id',
        actor_user_id: 'user-emp-123',
        payload: {
          saleId: 'sale-client-id',
          total: '2500.00',
          items: [
            {
              productId: 'prod-1',
              name: 'Leche La Serenisima',
              description: 'Entera 1L',
              quantity: 2,
              unitPrice: '1000.00',
              subtotal: '2000.00',
              discountAmount: '0.00',
            },
            {
              productId: 'prod-2',
              name: 'Pan Lactal',
              description: 'Blanco 500g',
              quantity: 1,
              unitPrice: '500.00',
              subtotal: '500.00',
              discountAmount: '50.00',
            },
          ],
          payments: [
            {
              method: 'cash',
              amount: '1500.00',
            },
            {
              method: 'qr',
              amount: '1000.00',
            },
          ],
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const createdSale = { id: 'sale-srv-789' } as Sale;
      saleRepo.create.mockResolvedValue(createdSale);

      const result = await handler.handle(entry);

      expect(saleRepo.create).toHaveBeenCalledTimes(1);
      expect(saleRepo.create).toHaveBeenCalledWith({
        user_id: 'user-emp-123',
        total: '2500.00',
        invoice_status: 'none',
        items: [
          {
            product_id: 'prod-1',
            name: 'Leche La Serenisima',
            description: 'Entera 1L',
            quantity: 2,
            unit_price: '1000.00',
            subtotal: '2000.00',
            discount_amount: '0.00',
          },
          {
            product_id: 'prod-2',
            name: 'Pan Lactal',
            description: 'Blanco 500g',
            quantity: 1,
            unit_price: '500.00',
            subtotal: '500.00',
            discount_amount: '50.00',
          },
        ],
        payment_methods: [
          {
            method: 'cash',
            amount: '1500.00',
          },
          {
            method: 'qr',
            amount: '1000.00',
          },
        ],
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'sale-srv-789',
      });
    });

    it('should handle nullable and missing item fields with appropriate defaults', async () => {
      const entry: SaleCreateEntry = {
        id: 'entry-sale-2',
        idempotency_key: 'idem-sale-2',
        operation_type: 'sale_create',
        aggregate_type: 'sale',
        aggregate_id: 'sale-client-2',
        actor_user_id: null,
        payload: {
          total: '300.00',
          items: [
            {
              quantity: 1,
              unitPrice: '300.00',
              subtotal: '300.00',
            },
          ],
          payments: [
            {
              method: 'transfer',
              amount: '300.00',
            },
          ],
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const createdSale = { id: 'sale-srv-456' } as Sale;
      saleRepo.create.mockResolvedValue(createdSale);

      const result = await handler.handle(entry);

      expect(saleRepo.create).toHaveBeenCalledWith({
        user_id: 'unknown',
        total: '300.00',
        invoice_status: 'none',
        items: [
          {
            product_id: null,
            name: null,
            description: null,
            quantity: 1,
            unit_price: '300.00',
            subtotal: '300.00',
            discount_amount: '0.00',
          },
        ],
        payment_methods: [
          {
            method: 'transfer',
            amount: '300.00',
          },
        ],
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'sale-srv-456',
      });
    });

    it('should handle empty items, empty payments, and undefined total gracefully', async () => {
      const entry: SaleCreateEntry = {
        id: 'entry-sale-empty',
        idempotency_key: 'idem-sale-empty',
        operation_type: 'sale_create',
        aggregate_type: 'sale',
        aggregate_id: 'sale-empty',
        actor_user_id: undefined,
        payload: {
          total: undefined as any,
          items: undefined as any,
          payments: undefined as any,
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const createdSale = { id: 'sale-srv-empty' } as Sale;
      saleRepo.create.mockResolvedValue(createdSale);

      const result = await handler.handle(entry);

      expect(saleRepo.create).toHaveBeenCalledWith({
        user_id: 'unknown',
        total: '0',
        invoice_status: 'none',
        items: [],
        payment_methods: [],
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'sale-srv-empty',
      });
    });

    it('should correctly map all valid payment methods: cash, transfer, card, qr', async () => {
      const entry: SaleCreateEntry = {
        id: 'entry-sale-pm',
        idempotency_key: 'idem-sale-pm',
        operation_type: 'sale_create',
        aggregate_type: 'sale',
        aggregate_id: 'sale-pm',
        actor_user_id: 'user-cashier',
        payload: {
          total: '400.00',
          items: [],
          payments: [
            { method: 'cash', amount: '100.00' },
            { method: 'transfer', amount: '100.00' },
            { method: 'card', amount: '100.00' },
            { method: 'qr', amount: '100.00' },
          ],
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const createdSale = { id: 'sale-srv-pm' } as Sale;
      saleRepo.create.mockResolvedValue(createdSale);

      const result = await handler.handle(entry);

      expect(saleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-cashier',
          payment_methods: [
            { method: 'cash', amount: '100.00' },
            { method: 'transfer', amount: '100.00' },
            { method: 'card', amount: '100.00' },
            { method: 'qr', amount: '100.00' },
          ],
        }),
      );
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'sale-srv-pm',
      });
    });

    it('should defensively fallback invalid or missing payment methods to cash and amount to "0"', async () => {
      const entry: SaleCreateEntry = {
        id: 'entry-sale-3',
        idempotency_key: 'idem-sale-3',
        operation_type: 'sale_create',
        aggregate_type: 'sale',
        aggregate_id: 'sale-client-3',
        actor_user_id: undefined,
        payload: {
          total: '100.00',
          items: [
            {
              productId: 'p-1',
              quantity: 1,
              unitPrice: '100.00',
              subtotal: '100.00',
            },
          ],
          payments: [
            {
              method: 'unknown_crypto' as any,
              amount: '50.00',
            },
            {
              method: undefined as any,
              amount: undefined as any,
            },
          ],
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const createdSale = { id: 'sale-srv-100' } as Sale;
      saleRepo.create.mockResolvedValue(createdSale);

      const result = await handler.handle(entry);

      expect(saleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'unknown',
          payment_methods: [
            {
              method: 'cash',
              amount: '50.00',
            },
            {
              method: 'cash',
              amount: '0',
            },
          ],
        }),
      );
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'sale-srv-100',
      });
    });
  });

  describe('unhandled operation', () => {
    it('should throw an error if called with an unsupported operation', async () => {
      const entry = {
        id: 'entry-invalid',
        idempotency_key: 'idem-invalid',
        operation_type: 'product_create',
        aggregate_type: 'product',
        aggregate_id: 'p-1',
        payload: { detalle: 'Prod' },
        created_at: '2026-08-17T00:00:00.000Z',
      } as any;

      await expect(handler.handle(entry)).rejects.toThrow(
        "Unhandled operation type 'product_create'.",
      );
    });
  });
});
