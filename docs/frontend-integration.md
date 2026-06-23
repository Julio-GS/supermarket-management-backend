# Supermarket MVP — Frontend Integration Guide

This guide maps the NestJS backend to the frontend contracts you need to call it. It covers auth, products, sales, paginated reads, safe caching behavior, error handling, TypeScript types, and the Bruno collection used to exercise the API.

## Quick path

1. `POST /auth/register` or `POST /auth/login` to get an `access_token`.
2. Store the token and send it on every protected request as `Authorization: Bearer <token>`.
3. `POST /products` to create products with at least one barcode.
4. `GET /products?search=leche&page=1&limit=20&sort=detalle:asc` for searchable paginated product reads, or `GET /products` for the legacy array response.
5. `GET /sales?page=1&limit=20&sort=created_at:desc` for paginated sale history, or `GET /sales` for the legacy array response.
6. `POST /sales` with `{ items: [{ product_id, quantity }], invoice_requested?: boolean }` to create a sale; the backend computes `total`.
7. Set `invoice_requested: true` only when the cashier asks for electronic invoicing. Local development can use `ARCA_MOCK=true` so the response includes fake invoice data without real ARCA credentials.
8. Handle `400`, `401`, `404`, and `409` using the error shape in [Error response shape](#error-response-shape).

## Base URL and API prefix

| Environment | Base URL                        | Source                              |
|-------------|---------------------------------|-------------------------------------|
| Local       | `http://localhost:3000/api/v1`  | `main.ts` global prefix + `.env`    |
| Production  | `https://<host>/api/v1`         | Set by deployment / `PORT` env var  |

All endpoints below are relative to that base URL. CORS is enabled in `main.ts`.

## Authentication

### Register

`POST /auth/register`

Creates a user and immediately logs them in.

```json
// Request
{
  "username": "demo",
  "password": "password123"
}
```

```json
// Response 201 Created
{
  "access_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

Constraints from `auth.dto.ts`:

| Field    | Type   | Min | Max  |
|----------|--------|-----|------|
| username | string | 3   | 50   |
| password | string | 6   | 100  |

### Login

`POST /auth/login`

```json
// Request
{
  "username": "demo",
  "password": "password123"
}
```

```json
// Response 200 OK
{
  "access_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Token storage and use

Store `access_token` in memory, `localStorage`, or a secure cookie — the backend only validates the header. Send it on every protected route:

```http
Authorization: Bearer <access_token>
```

Protected routes are all product and sale routes (`/products/*`, `/sales/*`).

## Read performance features

The backend now supports optimized read paths for product and sale listing screens.

### Backward-compatible list behavior

List endpoints intentionally keep the old response shape when no pagination query is sent:

```http
GET /products
GET /sales
```

Both return a plain JSON array, as before. This avoids breaking existing frontend screens.

Send any pagination query (`page`, `limit`, or `sort`) to opt into the new paginated response shape:

```http
GET /products?page=1&limit=20&sort=created_at:desc
GET /sales?page=1&limit=20&sort=created_at:desc
```

For product lists, `search` filters by product `detalle` or any barcode in `codigos`. Search alone keeps the legacy array shape; search plus `page`, `limit`, or `sort` returns the paginated wrapper.

### Pagination query contract

| Query | Type | Default | Limit | Notes |
|-------|------|---------|-------|-------|
| `page` | integer | `1` | min `1` | 1-based page number. |
| `limit` | integer | `20` | min `1`, max `100` | Page size. Requests above `100` are rejected by validation. |
| `sort` | string | endpoint default | allowed fields only | Format: `field:direction`, for example `created_at:desc` or `detalle:asc`. Invalid fields fall back to the endpoint default. |
| `search` | string | none | products only | Matches product `detalle` or barcode values in `codigos`. Does not opt into pagination by itself. |

Paginated responses use this wrapper:

```json
{
  "data": [
    { "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3,
    "hasNext": true
  }
}
```

### Sorting fields

| Endpoint | Supported sort examples | Default |
|----------|--------------------------|---------|
| `GET /products` | `created_at:desc`, `created_at:asc`, `detalle:asc`, `detalle:desc` | `created_at:desc` |
| `GET /sales` | `created_at:desc`, `created_at:asc`, `total:asc`, `total:desc` | `created_at:desc` |

If the frontend sends an unsupported sort field, the backend does not fail the request; it uses the endpoint default sort instead.

### Projection and caching behavior

The backend applies list projections internally so list queries fetch only the fields needed for list responses. There is no public `fields` query parameter yet.

Product read paths can use a short-lived read cache for safe product/reference data. Frontend code does not need to send cache headers or manage cache keys. Product writes invalidate product read cache entries server-side.

Do not assume sale creation, stock-sensitive behavior, or ARCA invoicing is cached. ARCA invoicing remains synchronous by design.

## Products module

Base route: `/products`. All routes require the bearer token.

### Create a product

`POST /products`

```json
// Request
{
  "detalle": "Test Product",
  "costo_neto": "1000.00",
  "costo_final": "2500.50",
  "iva": "21.00",
  "cambio_costo": "2024-01-01",
  "cambio_precio": "2024-01-01",
  "etiqueta": "test",
  "facturable": true,
  "maneja_stock": false,
  "codigos": ["123456789"]
}
```

```json
// Response 201 Created
{
  "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "detalle": "Test Product",
  "costo_neto": "1000.00",
  "costo_final": "2500.50",
  "iva": "21.00",
  "cambio_costo": "2024-01-01",
  "cambio_precio": "2024-01-01",
  "etiqueta": "test",
  "facturable": true,
  "maneja_stock": false,
  "codigos": ["123456789"],
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

Rules:

| Field        | Required | Notes                                                                    |
|--------------|----------|--------------------------------------------------------------------------|
| detalle      | yes      | Non-empty string.                                                        |
| costo_neto   | yes      | Money string: digits plus optional `.` with 1–2 decimals.                |
| costo_final  | yes      | Money string.                                                            |
| iva          | yes      | Money string.                                                            |
| cambio_costo | yes      | Date string; backend accepts any string, convention is ISO date.         |
| cambio_precio| yes      | Date string.                                                             |
| etiqueta     | yes      | String label.                                                            |
| facturable   | yes      | Boolean.                                                                 |
| maneja_stock | yes      | Boolean.                                                                 |
| codigos      | yes      | Array of strings, min length 1. Each barcode must be unique globally.    |

### List products

`GET /products`

Without query parameters, this returns the legacy array response:

```json
// Response 200 OK
[
  {
    "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "detalle": "Test Product",
    "costo_neto": "1000.00",
    "costo_final": "2500.50",
    "iva": "21.00",
    "cambio_costo": "2024-01-01",
    "cambio_precio": "2024-01-01",
    "etiqueta": "test",
    "facturable": true,
    "maneja_stock": false,
    "codigos": ["123456789"],
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

Use `search` to filter by product `detalle` or barcode. With only `search`, the endpoint keeps the legacy array response shape:

```http
GET /products?search=leche
```

With pagination parameters, this returns a page wrapper. Search composes with pagination and sorting:

```http
GET /products?search=leche&page=1&limit=20&sort=detalle:asc
```

```json
// Response 200 OK
{
  "data": [
    {
      "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "detalle": "Test Product",
      "costo_neto": "1000.00",
      "costo_final": "2500.50",
      "iva": "21.00",
      "cambio_costo": "2024-01-01",
      "cambio_precio": "2024-01-01",
      "etiqueta": "test",
      "facturable": true,
      "maneja_stock": false,
      "codigos": ["123456789"],
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasNext": false
  }
}
```

Use paginated reads for new product list screens. Keep `GET /products` without query params only for legacy screens that still expect an array.

### Get one product

`GET /products/:id`

`:id` is a UUID.

```json
// Response 200 OK
{
  "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  ...
}
```

Returns `404` if the product does not exist.

### Update a product

`PUT /products/:id`

Send only the fields you want to change. `codigos` is optional; when provided, the backend replaces the entire barcode list for that product.

```json
// Request
{
  "costo_neto": "1200.00",
  "costo_final": "2600.00",
  "cambio_precio": "2024-06-20"
}
```

```json
// Response 200 OK
{
  "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "detalle": "Test Product",
  "costo_neto": "1200.00",
  "costo_final": "2600.00",
  ...
}
```

Returns `404` if the product does not exist, `409` if any new barcode already belongs to another product.

### Delete a product

`DELETE /products/:id`

```http
// Response 204 No Content
```

Returns `404` if the product does not exist.

### Duplicate barcode handling

The `product_barcodes` table enforces a unique constraint on `codigo`. The backend checks it explicitly before create/update and returns:

```json
// Response 409 Conflict
{
  "statusCode": 409,
  "message": "One or more barcodes already exist",
  "path": "/api/v1/products",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

On update, the existing product's own barcodes are ignored during the duplicate check.

### Monetary strings

Fields `costo_neto`, `costo_final`, and `iva` must match:

```text
^-?\d+(\.\d{1,2})?$
```

Valid: `"2500.50"`, `"1000"`, `"0.99"`.  
Invalid: `"$1000"`, `"1,000.50"`, `"1000.123"`.

The backend stores them as `numeric(12,2)` and returns them as strings with two decimals (`"1000.00"`).

### Date fields

`cambio_costo` and `cambio_precio` are plain strings in the API. The convention used in tests and the Bruno collection is `"YYYY-MM-DD"`. They are not validated as dates, so ISO strings are also accepted.

### Snake_case fields

The product contract uses `snake_case` keys:

- `costo_neto`
- `costo_final`
- `cambio_costo`
- `cambio_precio`
- `maneja_stock`
- `created_at`
- `updated_at`

Do not camel-case them before sending or expect camel-case in responses.

## Sales module

Base route: `/sales`. All routes require the bearer token and operate on sales owned by the authenticated user (`req.user.sub`).

### Create a sale

`POST /sales`

```json
// Request
{
  "invoice_requested": false,
  "items": [
    {
      "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "quantity": 3
    }
  ]
}
```

```json
// Response 201 Created
{
  "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  "user_id": "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
  "total": "300.00",
  "items": [
    {
      "id": "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44",
      "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "quantity": 3,
      "unit_price": "100.00",
      "subtotal": "300.00"
    }
  ],
  "invoice_status": "none",
  "cae": null,
  "cae_vto": null,
  "cbte_nro": null,
  "cbte_tipo": null,
  "pto_vta": null,
  "invoice_requested_at": null,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

### Create a sale with electronic invoice

`POST /sales`

Use this only when the cashier explicitly requests ARCA electronic invoicing. V1 supports **Factura B** for **Consumidor Final** only.

```json
// Request
{
  "invoice_requested": true,
  "items": [
    {
      "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "quantity": 1
    }
  ]
}
```

```json
// Response 201 Created
{
  "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  "user_id": "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
  "total": "121.00",
  "items": [
    {
      "id": "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44",
      "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "quantity": 1,
      "unit_price": "121.00",
      "subtotal": "121.00"
    }
  ],
  "invoice_status": "issued",
  "cae": "MOCKCAE12345678",
  "cae_vto": "2026-07-02",
  "cbte_nro": 1,
  "cbte_tipo": 6,
  "pto_vta": 1,
  "invoice_requested_at": "2026-06-22T12:00:00.000Z",
  "created_at": "2026-06-22T12:00:00.000Z",
  "updated_at": "2026-06-22T12:00:00.000Z"
}
```

For local development without real ARCA credentials, configure the backend with:

```env
ARCA_ENABLED=true
ARCA_MOCK=true
ARCA_CUIT=20111111112
ARCA_PTO_VTA=1
ARCA_CERT=
ARCA_KEY=
```

Mock mode does not call `@arcasdk/core`; it only lets the frontend test the checkout, response mapping, and invoice UI states. Real ARCA emission still requires valid homologation/production credentials.

Rules:

| Field    | Required | Notes                                                              |
|----------|----------|--------------------------------------------------------------------|
| items    | yes      | Non-empty array.                                                   |
| product_id| yes (per item) | Valid product UUID.                                         |
| quantity | yes (per item) | Integer ≥ 1.                                                |
| invoice_requested | no | Defaults to `false`. When `true`, backend attempts electronic invoicing. |

The backend calculates `unit_price` from the product's `costo_final`, `subtotal = unit_price × quantity`, and `total` as the sum of subtotals.

There is no stock decrement and no customer model in the MVP. Invoicing uses Consumidor Final (`DocTipo=99`, `DocNro=0`) and Factura B (`cbte_tipo=6`).

Invoice fields in every sale response:

| Field | Type | Meaning |
|-------|------|---------|
| invoice_status | `"none" \| "issued" \| "failed"` | `none` for non-fiscal sales, `issued` when ARCA/mock succeeds. |
| cae | `string \| null` | Electronic authorization code. Null for non-fiscal sales. |
| cae_vto | `string \| null` | CAE expiration date. Null for non-fiscal sales. |
| cbte_nro | `number \| null` | Voucher number. Null for non-fiscal sales. |
| cbte_tipo | `number \| null` | `6` for Factura B. Null for non-fiscal sales. |
| pto_vta | `number \| null` | ARCA point of sale configured in backend. |
| invoice_requested_at | `string \| null` | ISO timestamp when invoice was requested. |

### List sales

`GET /sales`

Returns only the authenticated user's sales, ordered by `created_at DESC`.

Without query parameters, this returns the legacy array response:

```json
// Response 200 OK
[
  {
    "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    "user_id": "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
    "total": "300.00",
    "items": [...],
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

With pagination parameters, this returns a page wrapper:

```http
GET /sales?page=1&limit=20&sort=created_at:desc
```

```json
// Response 200 OK
{
  "data": [
    {
      "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      "user_id": "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
      "total": "300.00",
      "items": [...],
      "invoice_status": "none",
      "cae": null,
      "cae_vto": null,
      "cbte_nro": null,
      "cbte_tipo": null,
      "pto_vta": null,
      "invoice_requested_at": null,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasNext": false
  }
}
```

Sale history is scoped to the authenticated user. The frontend should not send a `user_id` query parameter.

### Get one sale

`GET /sales/:id`

Returns `404` if the sale does not exist or does not belong to the authenticated user.

### Sales error cases

| Scenario                         | Status | Message                              |
|----------------------------------|--------|--------------------------------------|
| Empty `items` array              | 400    | Sale must contain at least one item  |
| `product_id` does not exist      | 404    | Product <uuid> not found             |
| `quantity` < 1 or not an integer | 400    | validation error from class-validator|
| `invoice_requested=true` and any product has `facturable=false` | 400 | Invoice cannot be issued for non-facturable products |
| ARCA real-mode credentials are invalid or ARCA rejects the voucher | 500 | ARCA/SDK error message from backend |
| Missing/invalid token            | 401    | Invalid credentials / Unauthorized   |

## Error response shape

Every error uses the same JSON shape from `HttpExceptionFilter`:

```json
{
  "statusCode": 409,
  "message": "One or more barcodes already exist",
  "path": "/api/v1/products",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Common status codes

| Status | Meaning               | Typical triggers                                                             |
|--------|-----------------------|------------------------------------------------------------------------------|
| 400    | Bad Request           | Validation failures, empty sale items, malformed UUID, unknown extra fields. |
| 401    | Unauthorized          | Missing or invalid bearer token.                                             |
| 404    | Not Found             | Product or sale does not exist (or sale does not belong to the user).        |
| 409    | Conflict              | Duplicate username on register, duplicate barcode on product create/update.  |
| 500    | Internal Server Error | Unhandled server error.                                                      |

## Suggested frontend integration order

1. **Auth shell**: register, login, logout, token storage, and an HTTP interceptor that adds `Authorization: Bearer <token>`.
2. **Product list + create**: build the catalog UI; verify duplicate-barcode errors.
3. **Product edit + delete**: reuse the create form; note that sending `codigos` replaces all barcodes.
4. **Sale creation**: scan/select products and quantities; display backend-computed `total`.
5. **Optional invoice UI**: add a cashier-controlled “request electronic invoice” toggle. Show invoice fields only when `invoice_status === "issued"`.
6. **Sale history**: list and detail views scoped to the logged-in user, including invoice status.

## TypeScript request/response interfaces

```typescript
// Auth
interface RegisterRequest {
  username: string;
  password: string;
}

interface LoginRequest {
  username: string;
  password: string;
}

interface AuthResponse {
  access_token: string;
}

// Products
interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  search?: string; // products only
}

interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

interface PageResponse<T> {
  data: T[];
  meta: PageMeta;
}

interface CreateProductRequest {
  detalle: string;
  costo_neto: string;
  costo_final: string;
  iva: string;
  cambio_costo: string;
  cambio_precio: string;
  etiqueta: string;
  facturable: boolean;
  maneja_stock: boolean;
  codigos: string[];
}

type UpdateProductRequest = Partial<CreateProductRequest>;

interface ProductResponse {
  id: string;
  detalle: string;
  costo_neto: string;
  costo_final: string;
  iva: string;
  cambio_costo: string;
  cambio_precio: string;
  etiqueta: string;
  facturable: boolean;
  maneja_stock: boolean;
  codigos: string[];
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

type ProductListResponse = ProductResponse[] | PageResponse<ProductResponse>;

// Sales
interface SaleItemRequest {
  product_id: string;
  quantity: number;
}

interface CreateSaleRequest {
  items: SaleItemRequest[];
  invoice_requested?: boolean;
}

type InvoiceStatus = 'none' | 'issued' | 'failed';

interface SaleItemResponse {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
}

interface SaleResponse {
  id: string;
  user_id: string;
  total: string;
  items: SaleItemResponse[];
  invoice_status: InvoiceStatus;
  cae: string | null;
  cae_vto: string | null;
  cbte_nro: number | null;
  cbte_tipo: number | null;
  pto_vta: number | null;
  invoice_requested_at: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

type SaleListResponse = SaleResponse[] | PageResponse<SaleResponse>;

// Errors
interface ApiError {
  statusCode: number;
  message: string;
  path: string;
  timestamp: string;
}
```

## Minimal fetch/axios examples

### Fetch

```typescript
const API = 'http://localhost:3000/api/v1';

async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data.access_token;
}

async function createProduct(token: string, product: CreateProductRequest): Promise<ProductResponse> {
  const res = await fetch(`${API}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(product),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}

async function listProductsPage(
  token: string,
  query: PaginationQuery = { page: 1, limit: 20, sort: 'created_at:desc' },
): Promise<PageResponse<ProductResponse>> {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.sort) params.set('sort', query.sort);

  const res = await fetch(`${API}/products?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}
```

### Axios

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api/v1',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

async function createSale(items: SaleItemRequest[], invoiceRequested = false): Promise<SaleResponse> {
  const { data } = await api.post('/sales', {
    items,
    invoice_requested: invoiceRequested,
  });
  return data;
}

async function listSalesPage(page = 1): Promise<PageResponse<SaleResponse>> {
  const { data } = await api.get('/sales', {
    params: { page, limit: 20, sort: 'created_at:desc' },
  });
  return data;
}
```

## Bruno collection usage reference

A complete Bruno collection is in `bruno/`.

```text
bruno/
├── bruno.json
├── environments/Local.bru       # baseUrl = http://localhost:3000/api/v1
├── Register.bru
├── Login.bru
├── Create Product.bru
├── List Products.bru
├── Get Product.bru
├── Update Product.bru
├── Duplicate Barcode Conflict.bru
├── Create Sale.bru
├── Create Sale With ARCA Invoice.bru
├── List Sales.bru
├── Get Sale.bru
└── Protected Without Token.bru
```

Run the whole collection with the CLI:

```bash
cd bruno
bru run --env Local
```

Run a single request:

```bash
cd bruno
bru run "Create Product.bru" --env Local
```

The collection uses runtime variables (`username`, `password`, `token`, `productId`, `saleId`, `barcode1`, `barcode2`) so it can be executed repeatedly without manual setup. Use `Create Sale With ARCA Invoice` with `ARCA_MOCK=true` for local invoice UI testing without real ARCA credentials.

## Checklist

- [ ] Frontend uses `http://localhost:3000/api/v1` as the local base URL.
- [ ] Auth token is attached as `Authorization: Bearer <token>` on `/products` and `/sales` calls.
- [ ] Product create requests include at least one barcode in `codigos`.
- [ ] Money fields are sent as plain numeric strings with up to two decimals.
- [ ] Product date fields (`cambio_costo`, `cambio_precio`) are sent as strings.
- [ ] New list screens use paginated reads with `page`, `limit`, and `sort` instead of unbounded arrays.
- [ ] Frontend handles both legacy array responses and paginated `{ data, meta }` responses during migration.
- [ ] Frontend treats `meta.totalPages` and `meta.hasNext` as the source of truth for pagination controls.
- [ ] Sale `items` array is non-empty and each item has `product_id` and `quantity ≥ 1`.
- [ ] Frontend sends `invoice_requested: true` only when the cashier explicitly asks for electronic invoicing.
- [ ] Frontend does not add async/polling behavior for ARCA; sale creation with invoice remains a synchronous request.
- [ ] Frontend treats `invoice_status: "none"` as a non-fiscal sale and hides CAE/comprobante details.
- [ ] Frontend displays `cae`, `cae_vto`, `cbte_nro`, `cbte_tipo`, and `pto_vta` when `invoice_status: "issued"`.
- [ ] Frontend displays backend-computed `total`, `unit_price`, and `subtotal` from sale responses.
- [ ] `409 Conflict` is handled for duplicate barcodes and duplicate usernames.
- [ ] `404 Not Found` is handled for missing products or sales.

## Next step

Point the frontend at the local backend (`pnpm start:dev`), run the Bruno collection to confirm connectivity, then implement the auth interceptor and paginated product list first.
