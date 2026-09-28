import { Repository } from 'typeorm';
import { ProductSyncHandler } from '../product-sync.handler';
import { ProductRepositoryPort } from '../../../../products/application/product.repository.port';
import { TransactionRunnerPort } from '../../../../../shared/database/transaction-runner.port';
import { AutoLabelJobService } from '../../../../label-printer/application/auto-label-job.service';
import { SyncTombstoneEntity } from '../../../infrastructure/sync-tombstone.entity';
import { Product } from '../../../../products/domain/product.entity';
import { ValidationError } from '../../../../../shared/errors/domain.error';
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
    it('should create product with valid IVA and return accepted result with server_id', async () => {
      const entry: ProductCreateEntry = {
        id: 'entry-1',
        idempotency_key: 'idem-1',
        operation_type: 'product_create',
        aggregate_type: 'product',
        aggregate_id: 'prod-new',
        payload: {
          detalle: 'Alfajor Havanna',
          iva: '21.00',
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
        iva: '21.00',
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

    it('should normalize 10.5 IVA on create to 10.50', async () => {
      const entry: ProductCreateEntry = {
        id: 'entry-1b',
        idempotency_key: 'idem-1b',
        operation_type: 'product_create',
        aggregate_type: 'product',
        aggregate_id: 'prod-new-1b',
        payload: {
          detalle: 'Pan Lactal',
          iva: '10.5',
          facturable: true,
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const createdProduct = { id: 'prod-1b', detalle: 'Pan Lactal' } as Product;
      productRepo.create.mockResolvedValue(createdProduct);

      const result = await handler.handle(entry);

      expect(productRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          iva: '10.50',
          facturable: true,
        }),
      );
      expect(result.status).toBe('accepted');
    });

    it('should reject facturable product create when IVA is missing or null', async () => {
      const entry: ProductCreateEntry = {
        id: 'entry-err-missing-iva',
        idempotency_key: 'idem-err-1',
        operation_type: 'product_create',
        aggregate_type: 'product',
        aggregate_id: 'prod-err',
        payload: {
          detalle: 'No IVA Product',
          facturable: true,
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      await expect(handler.handle(entry)).rejects.toThrow(ValidationError);
      expect(productRepo.create).not.toHaveBeenCalled();
    });

    it('should reject facturable product create when IVA is 0 or 0.00', async () => {
      const entry: ProductCreateEntry = {
        id: 'entry-err-zero-iva',
        idempotency_key: 'idem-err-2',
        operation_type: 'product_create',
        aggregate_type: 'product',
        aggregate_id: 'prod-err',
        payload: {
          detalle: 'Zero IVA Product',
          facturable: true,
          iva: '0.00',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      await expect(handler.handle(entry)).rejects.toThrow(ValidationError);
      expect(productRepo.create).not.toHaveBeenCalled();
    });

    it('should reject product create when IVA is unsupported (e.g., 27.00)', async () => {
      const entry: ProductCreateEntry = {
        id: 'entry-err-unsupported-iva',
        idempotency_key: 'idem-err-3',
        operation_type: 'product_create',
        aggregate_type: 'product',
        aggregate_id: 'prod-err',
        payload: {
          detalle: 'Unsupported IVA Product',
          facturable: true,
          iva: '27.00',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      await expect(handler.handle(entry)).rejects.toThrow(ValidationError);
      expect(productRepo.create).not.toHaveBeenCalled();
    });

    it('should create non-facturable product with null IVA', async () => {
      const entry: ProductCreateEntry = {
        id: 'entry-non-facturable-null',
        idempotency_key: 'idem-nf-1',
        operation_type: 'product_create',
        aggregate_type: 'product',
        aggregate_id: 'prod-nf',
        payload: {
          detalle: 'Non Facturable',
          facturable: false,
          iva: null,
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const createdProduct = { id: 'prod-nf', detalle: 'Non Facturable' } as Product;
      productRepo.create.mockResolvedValue(createdProduct);

      const result = await handler.handle(entry);

      expect(productRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          facturable: false,
          iva: null,
        }),
      );
      expect(result.status).toBe('accepted');
    });

    it('should reject non-facturable product create when IVA is 0', async () => {
      const entry: ProductCreateEntry = {
        id: 'entry-nf-zero',
        idempotency_key: 'idem-nf-zero',
        operation_type: 'product_create',
        aggregate_type: 'product',
        aggregate_id: 'prod-nf-zero',
        payload: {
          detalle: 'Non Facturable Zero IVA',
          facturable: false,
          iva: '0',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      await expect(handler.handle(entry)).rejects.toThrow(ValidationError);
      expect(productRepo.create).not.toHaveBeenCalled();
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
        facturable: true,
        iva: '21.00',
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
        facturable: true,
        iva: '21.00',
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
        facturable: true,
        iva: '21.00',
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

      const currentProduct = {
        id: 'prod-100',
        detalle: 'Old Name',
        facturable: true,
        iva: '21.00',
      } as Product;
      productRepo.findById.mockResolvedValue(currentProduct);

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
        facturable: true,
        iva: '21.00',
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
        facturable: true,
        iva: '21.00',
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

    it('should normalize 10.5 IVA on sync update', async () => {
      const entry: ProductUpdateEntry = {
        id: 'entry-up-10.5',
        idempotency_key: 'idem-up-1',
        operation_type: 'product_update',
        aggregate_type: 'product',
        aggregate_id: 'prod-100',
        payload: {
          iva: '10.5',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const currentProduct = {
        id: 'prod-100',
        facturable: true,
        iva: '21.00',
      } as Product;
      productRepo.findById.mockResolvedValue(currentProduct);
      productRepo.update.mockResolvedValue({ id: 'prod-100' } as Product);

      await handler.handle(entry);

      expect(productRepo.update).toHaveBeenCalledWith('prod-100', {
        iva: '10.50',
      });
    });

    it('should normalize numeric-equivalent 10.500 IVA to 10.50 on sync update', async () => {
      const entry: ProductUpdateEntry = {
        id: 'entry-up-10.500',
        idempotency_key: 'idem-up-1b',
        operation_type: 'product_update',
        aggregate_type: 'product',
        aggregate_id: 'prod-100',
        payload: {
          iva: '10.500',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const currentProduct = {
        id: 'prod-100',
        facturable: true,
        iva: '21.00',
      } as Product;
      productRepo.findById.mockResolvedValue(currentProduct);
      productRepo.update.mockResolvedValue({ id: 'prod-100' } as Product);

      await handler.handle(entry);

      expect(productRepo.update).toHaveBeenCalledWith('prod-100', {
        iva: '10.50',
      });
    });

    it('should normalize numeric-equivalent 21.000 IVA to 21.00 on sync update', async () => {
      const entry: ProductUpdateEntry = {
        id: 'entry-up-21.000',
        idempotency_key: 'idem-up-1c',
        operation_type: 'product_update',
        aggregate_type: 'product',
        aggregate_id: 'prod-100',
        payload: {
          iva: '21.000',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const currentProduct = {
        id: 'prod-100',
        facturable: true,
        iva: '10.50',
      } as Product;
      productRepo.findById.mockResolvedValue(currentProduct);
      productRepo.update.mockResolvedValue({ id: 'prod-100' } as Product);

      await handler.handle(entry);

      expect(productRepo.update).toHaveBeenCalledWith('prod-100', {
        iva: '21.00',
      });
    });

    it('should reject sync update with 0 IVA', async () => {
      const entry: ProductUpdateEntry = {
        id: 'entry-up-zero',
        idempotency_key: 'idem-up-zero',
        operation_type: 'product_update',
        aggregate_type: 'product',
        aggregate_id: 'prod-100',
        payload: {
          iva: '0.00',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const currentProduct = {
        id: 'prod-100',
        facturable: true,
        iva: '21.00',
      } as Product;
      productRepo.findById.mockResolvedValue(currentProduct);

      await expect(handler.handle(entry)).rejects.toThrow(ValidationError);
      expect(productRepo.update).not.toHaveBeenCalled();
    });

    it('should reject making a product facturable on sync update if resulting IVA is null', async () => {
      const entry: ProductUpdateEntry = {
        id: 'entry-up-facturable-null-iva',
        idempotency_key: 'idem-up-fac',
        operation_type: 'product_update',
        aggregate_type: 'product',
        aggregate_id: 'prod-100',
        payload: {
          facturable: true,
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const currentProduct = {
        id: 'prod-100',
        facturable: false,
        iva: null,
      } as Product;
      productRepo.findById.mockResolvedValue(currentProduct);

      await expect(handler.handle(entry)).rejects.toThrow(ValidationError);
      expect(productRepo.update).not.toHaveBeenCalled();
    });

    describe('Bypass 2 regression — validating full resulting persisted state on sync update', () => {
      it('should reject sync update with detail-only patch when existing facturable product has invalid 0.00 IVA', async () => {
        const entry: ProductUpdateEntry = {
          id: 'entry-bp2-1',
          idempotency_key: 'idem-bp2-1',
          operation_type: 'product_update',
          aggregate_type: 'product',
          aggregate_id: 'prod-100',
          payload: {
            detalle: 'New Name Only',
          },
          created_at: '2026-08-17T00:00:00.000Z',
        };

        const currentProduct = {
          id: 'prod-100',
          facturable: true,
          iva: '0.00',
        } as Product;
        productRepo.findById.mockResolvedValue(currentProduct);

        await expect(handler.handle(entry)).rejects.toThrow(ValidationError);
        expect(productRepo.update).not.toHaveBeenCalled();
      });

      it('should reject sync update with detail-only patch when existing non-facturable product has invalid 0.00 IVA', async () => {
        const entry: ProductUpdateEntry = {
          id: 'entry-bp2-2',
          idempotency_key: 'idem-bp2-2',
          operation_type: 'product_update',
          aggregate_type: 'product',
          aggregate_id: 'prod-100',
          payload: {
            detalle: 'New Name Only',
          },
          created_at: '2026-08-17T00:00:00.000Z',
        };

        const currentProduct = {
          id: 'prod-100',
          facturable: false,
          iva: '0.00',
        } as Product;
        productRepo.findById.mockResolvedValue(currentProduct);

        await expect(handler.handle(entry)).rejects.toThrow(ValidationError);
        expect(productRepo.update).not.toHaveBeenCalled();
      });

      it('should reject sync update with detail-only patch when existing facturable product has null IVA', async () => {
        const entry: ProductUpdateEntry = {
          id: 'entry-bp2-3',
          idempotency_key: 'idem-bp2-3',
          operation_type: 'product_update',
          aggregate_type: 'product',
          aggregate_id: 'prod-100',
          payload: {
            detalle: 'New Name Only',
          },
          created_at: '2026-08-17T00:00:00.000Z',
        };

        const currentProduct = {
          id: 'prod-100',
          facturable: true,
          iva: null,
        } as Product;
        productRepo.findById.mockResolvedValue(currentProduct);

        await expect(handler.handle(entry)).rejects.toThrow(ValidationError);
        expect(productRepo.update).not.toHaveBeenCalled();
      });

      it('should allow sync update with detail-only patch when existing non-facturable product has valid null IVA', async () => {
        const entry: ProductUpdateEntry = {
          id: 'entry-bp2-4',
          idempotency_key: 'idem-bp2-4',
          operation_type: 'product_update',
          aggregate_type: 'product',
          aggregate_id: 'prod-100',
          payload: {
            detalle: 'New Name Only',
          },
          created_at: '2026-08-17T00:00:00.000Z',
        };

        const currentProduct = {
          id: 'prod-100',
          facturable: false,
          iva: null,
        } as Product;
        productRepo.findById.mockResolvedValue(currentProduct);
        productRepo.update.mockResolvedValue({
          id: 'prod-100',
          facturable: false,
          iva: null,
          detalle: 'New Name Only',
        } as Product);

        const result = await handler.handle(entry);

        expect(result).toEqual({
          status: 'accepted',
          server_id: 'prod-100',
        });
        expect(productRepo.update).toHaveBeenCalledWith('prod-100', {
          detalle: 'New Name Only',
        });
      });

      it('should allow fixing invalid existing IVA via sync update when explicit valid IVA is supplied', async () => {
        const entry: ProductUpdateEntry = {
          id: 'entry-bp2-5',
          idempotency_key: 'idem-bp2-5',
          operation_type: 'product_update',
          aggregate_type: 'product',
          aggregate_id: 'prod-100',
          payload: {
            detalle: 'Fixed Name',
            iva: '10.500',
          },
          created_at: '2026-08-17T00:00:00.000Z',
        };

        const currentProduct = {
          id: 'prod-100',
          facturable: true,
          iva: '0.00',
        } as Product;
        productRepo.findById.mockResolvedValue(currentProduct);
        productRepo.update.mockResolvedValue({
          id: 'prod-100',
          facturable: true,
          iva: '10.50',
          detalle: 'Fixed Name',
        } as Product);

        const result = await handler.handle(entry);

        expect(result).toEqual({
          status: 'accepted',
          server_id: 'prod-100',
        });
        expect(productRepo.update).toHaveBeenCalledWith('prod-100', {
          detalle: 'Fixed Name',
          iva: '10.50',
        });
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
