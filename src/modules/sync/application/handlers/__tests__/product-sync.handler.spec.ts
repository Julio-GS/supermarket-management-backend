import { Repository } from 'typeorm';
import { ProductSyncHandler } from '../product-sync.handler';
import { ProductRepositoryPort } from '../../../../products/application/product.repository.port';
import { TransactionRunnerPort } from '../../../../../shared/database/transaction-runner.port';
import { AutoLabelJobService } from '../../../../label-printer/application/auto-label-job.service';
import { SyncTombstoneEntity } from '../../../infrastructure/sync-tombstone.entity';
import { Product } from '../../../../products/domain/product.entity';
import {
  ProductCreateEntry,
  ProductUpdateEntry,
  ProductDeleteEntry,
} from '../../../domain/sync-payloads';

describe('ProductSyncHandler', () => {
  let handler: ProductSyncHandler;
  let productRepo: jest.Mocked<ProductRepositoryPort>;
  let transactionRunner: jest.Mocked<TransactionRunnerPort>;
  let autoLabel: jest.Mocked<AutoLabelJobService>;
  let tombstoneRepo: jest.Mocked<Repository<SyncTombstoneEntity>>;

  beforeEach(() => {
    productRepo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findPage: jest.fn(),
      findById: jest.fn(),
      findByIdsForSale: jest.fn(),
      findByBarcode: jest.fn(),
      findByCode: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      existsAnyBarcode: jest.fn(),
    } as unknown as jest.Mocked<ProductRepositoryPort>;

    transactionRunner = {
      run: jest.fn().mockImplementation(async (work) => work({} as any)),
    } as unknown as jest.Mocked<TransactionRunnerPort>;

    autoLabel = {
      onProductPriceChanged: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<AutoLabelJobService>;

    tombstoneRepo = {
      save: jest.fn().mockResolvedValue({} as any),
    } as unknown as jest.Mocked<Repository<SyncTombstoneEntity>>;

    handler = new ProductSyncHandler(
      productRepo,
      transactionRunner,
      autoLabel,
      tombstoneRepo,
    );
  });

  it('should declare supportedOperations containing product_create, product_update, product_delete', () => {
    expect(handler.supportedOperations).toBeInstanceOf(Set);
    expect(handler.supportedOperations.has('product_create')).toBe(true);
    expect(handler.supportedOperations.has('product_update')).toBe(true);
    expect(handler.supportedOperations.has('product_delete')).toBe(true);
    expect(handler.supportedOperations.size).toBe(3);
  });

  describe('product_create', () => {
    it('should create product with defaults and return accepted result with server_id', async () => {
      const entry: ProductCreateEntry = {
        id: 'entry-1',
        idempotency_key: 'idem-1',
        operation_type: 'product_create',
        aggregate_type: 'product',
        aggregate_id: 'prod-new',
        payload: {
          detalle: 'Alfajor Havanna',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const createdProduct = { id: 'prod-123', detalle: 'Alfajor Havanna' } as Product;
      productRepo.create.mockResolvedValue(createdProduct);

      const result = await handler.handle(entry);

      expect(productRepo.create).toHaveBeenCalledWith({
        detalle: 'Alfajor Havanna',
        costo_neto: null,
        costo_final: null,
        iva: null,
        cambio_costo: 'fixed',
        cambio_precio: 'fixed',
        etiqueta: '',
        facturable: true,
        maneja_stock: true,
        codigos: [],
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'prod-123',
      });
    });

    it('should pass all optional payload fields to product create when present', async () => {
      const entry: ProductCreateEntry = {
        id: 'entry-2',
        idempotency_key: 'idem-2',
        operation_type: 'product_create',
        aggregate_type: 'product',
        aggregate_id: 'prod-new-2',
        payload: {
          detalle: 'Yerba Taragui',
          costo_neto: '100.00',
          costo_final: '121.00',
          iva: '21.00',
          cambio_costo: 'percentage',
          cambio_precio: 'percentage',
          etiqueta: 'Yerba',
          facturable: false,
          maneja_stock: false,
          codigos: ['7791234567890'],
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const createdProduct = { id: 'prod-456', detalle: 'Yerba Taragui' } as Product;
      productRepo.create.mockResolvedValue(createdProduct);

      const result = await handler.handle(entry);

      expect(productRepo.create).toHaveBeenCalledWith({
        detalle: 'Yerba Taragui',
        costo_neto: '100.00',
        costo_final: '121.00',
        iva: '21.00',
        cambio_costo: 'percentage',
        cambio_precio: 'percentage',
        etiqueta: 'Yerba',
        facturable: false,
        maneja_stock: false,
        codigos: ['7791234567890'],
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'prod-456',
      });
    });
  });

  describe('product_update', () => {
    it('should return conflict when base_server_version does not match current entity version (Date)', async () => {
      const entry: ProductUpdateEntry = {
        id: 'entry-3',
        idempotency_key: 'idem-3',
        operation_type: 'product_update',
        aggregate_type: 'product',
        aggregate_id: 'prod-100',
        base_server_version: '2026-08-15T10:00:00.000Z',
        payload: {
          detalle: 'Updated name',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const existingProduct = {
        id: 'prod-100',
        updated_at: new Date('2026-08-16T12:00:00.000Z'),
      } as Product;
      productRepo.findById.mockResolvedValue(existingProduct);

      const result = await handler.handle(entry);

      expect(result).toEqual({
        status: 'conflict',
        server_version: '2026-08-16T12:00:00.000Z',
        reason:
          'Server version 2026-08-16T12:00:00.000Z differs from base version 2026-08-15T10:00:00.000Z. Another client has already updated this product.',
      });
      expect(productRepo.update).not.toHaveBeenCalled();
    });

    it('should return conflict when base_server_version does not match current entity version (string updated_at)', async () => {
      const entry: ProductUpdateEntry = {
        id: 'entry-3b',
        idempotency_key: 'idem-3b',
        operation_type: 'product_update',
        aggregate_type: 'product',
        aggregate_id: 'prod-100',
        base_server_version: 'v1',
        payload: {
          detalle: 'Updated name',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const existingProduct = {
        id: 'prod-100',
        updated_at: 'v2' as unknown as Date,
      } as Product;
      productRepo.findById.mockResolvedValue(existingProduct);

      const result = await handler.handle(entry);

      expect(result).toEqual({
        status: 'conflict',
        server_version: 'v2',
        reason:
          'Server version v2 differs from base version v1. Another client has already updated this product.',
      });
      expect(productRepo.update).not.toHaveBeenCalled();
    });

    it('should proceed with update when base_server_version matches current entity version', async () => {
      const entry: ProductUpdateEntry = {
        id: 'entry-3c',
        idempotency_key: 'idem-3c',
        operation_type: 'product_update',
        aggregate_type: 'product',
        aggregate_id: 'prod-100',
        base_server_version: '2026-08-16T12:00:00.000Z',
        payload: {
          detalle: 'Matching Version Update',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const existingProduct = {
        id: 'prod-100',
        updated_at: new Date('2026-08-16T12:00:00.000Z'),
      } as Product;
      productRepo.findById.mockResolvedValue(existingProduct);
      productRepo.update.mockResolvedValue({ id: 'prod-100' } as Product);

      const result = await handler.handle(entry);

      expect(result).toEqual({
        status: 'accepted',
        server_id: 'prod-100',
      });
      expect(productRepo.update).toHaveBeenCalledWith('prod-100', {
        detalle: 'Matching Version Update',
      });
    });

    it('should proceed with update when base_server_version is set but product is not found', async () => {
      const entry: ProductUpdateEntry = {
        id: 'entry-3d',
        idempotency_key: 'idem-3d',
        operation_type: 'product_update',
        aggregate_type: 'product',
        aggregate_id: 'prod-not-found',
        base_server_version: 'v1',
        payload: {
          detalle: 'New Product Detalle',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      productRepo.findById.mockResolvedValue(null);
      productRepo.update.mockResolvedValue(null);

      const result = await handler.handle(entry);

      expect(result).toEqual({
        status: 'accepted',
        server_id: 'prod-not-found',
      });
      expect(productRepo.update).toHaveBeenCalledWith('prod-not-found', {
        detalle: 'New Product Detalle',
      });
    });

    it('should fallback server_id to aggregate_id when productRepo.update returns null', async () => {
      const entry: ProductUpdateEntry = {
        id: 'entry-3e',
        idempotency_key: 'idem-3e',
        operation_type: 'product_update',
        aggregate_type: 'product',
        aggregate_id: 'prod-fallback',
        payload: {
          detalle: 'Fallback server_id test',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      productRepo.update.mockResolvedValue(null);

      const result = await handler.handle(entry);

      expect(result).toEqual({
        status: 'accepted',
        server_id: 'prod-fallback',
      });
    });

    it('should update product without transaction or auto-label when costo_final is not changed', async () => {
      const entry: ProductUpdateEntry = {
        id: 'entry-4',
        idempotency_key: 'idem-4',
        operation_type: 'product_update',
        aggregate_type: 'product',
        aggregate_id: 'prod-100',
        payload: {
          detalle: 'New Name Only',
          facturable: true,
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const updatedProduct = { id: 'prod-100', detalle: 'New Name Only' } as Product;
      productRepo.update.mockResolvedValue(updatedProduct);

      const result = await handler.handle(entry);

      expect(transactionRunner.run).not.toHaveBeenCalled();
      expect(autoLabel.onProductPriceChanged).not.toHaveBeenCalled();
      expect(productRepo.update).toHaveBeenCalledWith('prod-100', {
        detalle: 'New Name Only',
        facturable: true,
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'prod-100',
      });
    });

    it('should run update and auto-label inside transaction when costo_final changes', async () => {
      const entry: ProductUpdateEntry = {
        id: 'entry-5',
        idempotency_key: 'idem-5',
        operation_type: 'product_update',
        aggregate_type: 'product',
        aggregate_id: 'prod-100',
        payload: {
          costo_final: '150.00',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const currentProduct = {
        id: 'prod-100',
        detalle: 'Product 100',
        costo_final: '100.00',
        codigos: ['12345'],
      } as Product;
      productRepo.findById.mockResolvedValue(currentProduct);

      const fakeRunner = { isTransaction: true } as any;
      transactionRunner.run.mockImplementation(async (work) => work(fakeRunner));

      const updatedProduct = { id: 'prod-100', costo_final: '150.00' } as Product;
      productRepo.update.mockResolvedValue(updatedProduct);

      const result = await handler.handle(entry);

      expect(transactionRunner.run).toHaveBeenCalled();
      expect(productRepo.update).toHaveBeenCalledWith(
        'prod-100',
        { costo_final: '150.00' },
        fakeRunner,
      );
      expect(autoLabel.onProductPriceChanged).toHaveBeenCalledWith(
        {
          id: 'prod-100',
          detalle: 'Product 100',
          costo_final: '100.00',
          codigos: ['12345'],
        },
        '150.00',
        fakeRunner,
      );
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'prod-100',
      });
    });

    it('should not run transaction when costo_final equals current costo_final', async () => {
      const entry: ProductUpdateEntry = {
        id: 'entry-6',
        idempotency_key: 'idem-6',
        operation_type: 'product_update',
        aggregate_type: 'product',
        aggregate_id: 'prod-100',
        payload: {
          costo_final: '100.00',
          detalle: 'Same Price',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const currentProduct = {
        id: 'prod-100',
        detalle: 'Product 100',
        costo_final: '100.00',
        codigos: ['12345'],
      } as Product;
      productRepo.findById.mockResolvedValue(currentProduct);

      const updatedProduct = { id: 'prod-100', detalle: 'Same Price' } as Product;
      productRepo.update.mockResolvedValue(updatedProduct);

      const result = await handler.handle(entry);

      expect(transactionRunner.run).not.toHaveBeenCalled();
      expect(autoLabel.onProductPriceChanged).not.toHaveBeenCalled();
      expect(productRepo.update).toHaveBeenCalledWith('prod-100', {
        costo_final: '100.00',
        detalle: 'Same Price',
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'prod-100',
      });
    });
  });

  describe('product_delete', () => {
    it('should delete product from repository, persist tombstone, and return accepted', async () => {
      const entry: ProductDeleteEntry = {
        id: 'entry-7',
        idempotency_key: 'idem-7',
        operation_type: 'product_delete',
        aggregate_type: 'product',
        aggregate_id: 'prod-delete-id',
        payload: {},
        created_at: '2026-08-17T00:00:00.000Z',
      };

      productRepo.delete.mockResolvedValue(undefined);

      const result = await handler.handle(entry);

      expect(productRepo.delete).toHaveBeenCalledWith('prod-delete-id');
      expect(tombstoneRepo.save).toHaveBeenCalledWith({
        entity_id: 'prod-delete-id',
        aggregate_type: 'product',
        operation_type: 'product_delete',
      });
      expect(result).toEqual({
        status: 'accepted',
      });
    });
  });

  describe('unhandled operation', () => {
    it('should throw when an unsupported operation type is passed', async () => {
      const invalidEntry = {
        id: 'entry-err',
        idempotency_key: 'idem-err',
        operation_type: 'sale_create' as any,
        aggregate_type: 'sale' as any,
        aggregate_id: 'sale-1',
        payload: {} as any,
        created_at: '2026-08-17T00:00:00.000Z',
      };

      await expect(handler.handle(invalidEntry)).rejects.toThrow(
        "Unhandled operation type 'sale_create'.",
      );
    });
  });
});
