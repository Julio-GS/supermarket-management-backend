# Promotions — Frontend Integration Guide

This guide covers everything frontend developers need to build a Promotions admin screen and understand how active promotions affect product display, checkout, and sale history.

It assumes you already have auth, product, and sale flows working. See [`frontend-integration.md`](./frontend-integration.md) for the full API reference and [`sales-and-reports-integration.md`](./sales-and-reports-integration.md) for payment allocations and reports.

## Quick path

1. `GET /promotions` to list all promotions (no pagination — returns the full array).
2. `POST /promotions` to create a product discount or a store-wide promotion.
3. `PUT /promotions/:id` to edit or toggle on/off.
4. `DELETE /promotions/:id` soft-disables it (sets `enabled: false`).
5. Product responses carry `promotions` (product-scoped) and `store_promotions` (store-wide). Show active badges on product cards.
6. Sale item responses carry `applied_promotions` (stacked) plus legacy `applied_promotion_id` and `applied_promotion_type`. Show discount rows in sale detail.
7. Ad-hoc sale items can receive store-wide promotions, but effective product promotions do not apply to them.
8. There is **no** `POST /sales/preview` endpoint — the frontend estimates discounts visually, and the backend is the source of truth at sale time.

## Core concepts

Promotions are **automatic** — the frontend does NOT select or apply promotions during checkout. The backend resolves everything at `POST /sales` time.

| Concept | Behavior |
|---------|----------|
| Automatic | Backend picks promotions for each sale item during `POST /sales`. No frontend action needed. |
| Stacking | Store-wide promotions + one product promotion **stack** per sale item. Product promotions do NOT stack with each other (only the best one wins). |
| Product scope | A promotion targets a single `product_id`. At most one product promotion applies per catalog-backed sale item. |
| Store scope | A promotion applies to **all** products. Multiple store-wide promotions can apply simultaneously. |
| No stock effect | Promotions do NOT alter stock; only discounts the sale price. |
| Invoicing | ARCA invoices use the final `total`. Discount detail is visible in the sale, not embedded in the invoice voucher. |
| No preview endpoint | There is no `POST /sales/preview`. The frontend should estimate discounts client-side using `promotions` + `store_promotions` data from product endpoints, then confirm the real result from the sale response. |

### Promotion scopes

| Scope | Key | `product_id` | Applies to |
|-------|-----|-------------|------------|
| Product | `"product"` | Required — UUID of the target product | Only that one product |
| Store | `"store"` | Must be omitted / `null` | All products in the store |

Scope defaults to `"product"` when omitted from the create request (backward-compatible behavior). The response always includes `scope` explicitly.

### Promotion types

| Type | Key | Discount rule | Requires `discount_percent`? |
|------|-----|---------------|------------------------------|
| Percentage | `"percentage"` | `discount_percent` % off subtotal (1–99) | Yes (integer 1–99) |
| 2-for-1 | `"two_x_one"` | `floor(quantity / 2)` free units at `unit_price` | No (must be absent/null) |

### Schedule: date range or weekday recurrence

Every promotion must have ONE active schedule mechanism — not both, not neither:

| Schedule type | Fields used | Example |
|---------------|-------------|---------|
| Date range | `start_date` + `end_date` | `"2026-07-01T00:00:00.000Z"` to `"2026-07-31T23:59:59.000Z"` — active when `now` is between them inclusive. |
| Weekday recurrence | `weekdays: [1, 3, 5]` | Active every Monday, Wednesday, and Friday — repeat indefinitely. |

Weekdays use ISO numbering: **1 = Monday, 2 = Tuesday, …, 7 = Sunday**. Timezone is always `America/Argentina/Buenos_Aires` (ART, UTC-3).

### How promotions resolve at checkout (stacking model)

At checkout, for each sale item:

1. Find all `enabled` store-wide promotions whose schedule is currently active. **All of them** apply — each computes its discount independently.
2. For catalog-backed items only, find all `enabled` product promotions for that `product_id` whose schedule is currently active. From those, **pick the single best one** (largest monetary discount).
3. If the same product promotion type has equal amounts: **percentage beats 2-for-1**. If same type with equal amounts: **newest `updated_at`** wins.
4. The final `discount_amount` on the sale item is the **sum** of all applied promotions (store-wide + best product).
5. The `applied_promotions` array lists every promotion that contributed, sorted by discount amount descending.
6. If the item is ad-hoc, keep only the store-scoped entries in `applied_promotions` and ignore effective product-scoped discounting.
7. If no promotion qualifies, the item gets no discount (`discount_amount: "0.00"`, `applied_promotions: []`).

## Endpoints

All endpoints are prefixed with `/promotions` and return a `PromotionResponse` object. `DELETE /promotions/:id` returns `204 No Content` on successful soft-deactivation. All routes require the bearer token (`Authorization: Bearer <token>`).

| Method | Path | What it does |
|--------|------|-------------|
| `POST` | `/promotions` | Create a new promotion (enabled by default). |
| `GET` | `/promotions` | List all promotions (no pagination). |
| `PUT` | `/promotions/:id` | Update any field, including toggling `enabled`. |
| `DELETE` | `/promotions/:id` | Soft-disable (`enabled: false`). Hard delete is not exposed. |

### Create a promotion

`POST /promotions`

```json
// Request — percentage discount on a product, Mon–Fri
{
  "name": "10% OFF semana",
  "description": "Descuento especial de lunes a viernes",
  "scope": "product",
  "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "type": "percentage",
  "discount_percent": 10,
  "weekdays": [1, 2, 3, 4, 5]
}
```

```json
// Request — 2-for-1 with date range
{
  "name": "2x1 Julio",
  "scope": "product",
  "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "type": "two_x_one",
  "start_date": "2026-07-01T00:00:00.000Z",
  "end_date": "2026-07-31T23:59:59.000Z"
}
```

```json
// Request — store-wide percentage discount
{
  "name": "15% OFF en toda la tienda",
  "description": "Promo fin de semana",
  "scope": "store",
  "type": "percentage",
  "discount_percent": 15,
  "start_date": "2026-07-10T00:00:00.000Z",
  "end_date": "2026-07-12T23:59:59.000Z"
}
```

```json
// Response 201 Created
{
  "id": "p0eebc99-9c0b-4ef8-bb6d-6bb9bd380a88",
  "name": "10% OFF semana",
  "description": "Descuento especial de lunes a viernes",
  "scope": "product",
  "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "type": "percentage",
  "discount_percent": 10,
  "start_date": null,
  "end_date": null,
  "weekdays": [1, 2, 3, 4, 5],
  "enabled": true,
  "created_at": "2026-07-06T00:00:00.000Z",
  "updated_at": "2026-07-06T00:00:00.000Z"
}
```

### List promotions

`GET /promotions`

Returns the full array of all promotions (enabled + disabled). No pagination, search, or filtering query parameters. Sort order is `created_at DESC`.

```json
// Response 200 OK
[
  {
    "id": "p0eebc99-...",
    "name": "15% OFF en toda la tienda",
    "description": "Promo fin de semana",
    "scope": "store",
    "product_id": null,
    "type": "percentage",
    "discount_percent": 15,
    "start_date": "2026-07-10T00:00:00.000Z",
    "end_date": "2026-07-12T23:59:59.000Z",
    "weekdays": null,
    "enabled": true,
    "created_at": "2026-07-06T00:00:00.000Z",
    "updated_at": "2026-07-06T00:00:00.000Z"
  }
]
```

### Update a promotion

`PUT /promotions/:id`

`:id` is a UUID. Send only the fields you want to change — all fields are optional. The request is fully partial.

```json
// Request — change discount percent and toggle off
{
  "discount_percent": 20,
  "enabled": false
}
```

```json
// Response 200 OK
{
  "id": "p0eebc99-...",
  "name": "10% OFF semana",
  "description": "Descuento especial de lunes a viernes",
  "scope": "product",
  "product_id": "a0eebc99-...",
  "type": "percentage",
  "discount_percent": 20,
  "start_date": null,
  "end_date": null,
  "weekdays": [1, 2, 3, 4, 5],
  "enabled": false,
  "created_at": "2026-07-06T00:00:00.000Z",
  "updated_at": "2026-07-06T01:00:00.000Z"
}
```

You can change `name`, `description`, `scope`, `type`, add/remove `discount_percent`, switch between date range and weekdays, or toggle `enabled`. The same cross-field validation rules apply as on create.

Returns `404` if the promotion does not exist.

### Disable a promotion

`DELETE /promotions/:id`

Soft-disable only — sets `enabled: false` without deleting the row. Returns `204 No Content`.

Use `PUT /promotions/:id` with `{ "enabled": true }` to re-enable.

Returns `404` if the promotion does not exist.

## Validation rules

The backend enforces these on create and update. Show validation errors inline in the form.

### Cross-field rules

| Rule | Error |
|------|-------|
| `scope: "product"` requires `product_id` (valid UUID). | "product_id is required for product promotions and must be omitted for store-wide promotions" |
| `scope: "store"` must NOT have `product_id`. | Same as above. |
| `type: "percentage"` requires `discount_percent` (1–99, integer). | "percentage type requires discount_percent (1-99); two_x_one must NOT have discount_percent" |
| `type: "two_x_one"` must NOT have `discount_percent`. | Same as above. |
| Must provide either (`start_date` + `end_date`) with `start_date <= end_date`, OR `weekdays` array (min 1 element). | "Either a date range (start_date + end_date with start <= end) or weekdays (1-7) must be provided" |
| `weekdays` elements must be integers 1–7, no duplicates. | class-validator messages for `@Min`, `@Max`, `@ArrayUnique`. |

### Field-level rules

| Field | Create | Update | Type | Constraints |
|-------|--------|--------|------|-------------|
| `name` | required | optional | string, non-empty | Display name for the promotion. |
| `description` | optional | optional | string or null | Free-text description. |
| `scope` | optional | optional | `"product" \| "store"` | Defaults to `"product"` when omitted. |
| `product_id` | conditional | conditional | UUID string or null | Required for `scope: "product"`; must be null/omitted for `scope: "store"`. Immutable on update once set. |
| `type` | required | optional | `"percentage" \| "two_x_one"` | |
| `discount_percent` | optional | optional | integer or null | 1–99 for percentage; must be absent/null for two_x_one. |
| `start_date` | optional | optional | ISO 8601 string or null | Required if using date range schedule. |
| `end_date` | optional | optional | ISO 8601 string or null | Required if using date range schedule. Must be >= start_date. |
| `weekdays` | optional | optional | `number[]` or null | Required if using weekday schedule. Integers 1–7, no duplicates. |
| `enabled` | — (not in create) | optional | boolean | Defaults to `true` on create. Toggle via PUT. |

### Error response shape

Same as the rest of the API — see [`frontend-integration.md`](./frontend-integration.md#error-response-shape):

```json
{
  "statusCode": 400,
  "message": "percentage type requires discount_percent (1-99); two_x_one must NOT have discount_percent",
  "path": "/api/v1/promotions",
  "timestamp": "2026-07-06T00:00:00.000Z"
}
```

## Promotions in product responses

Every product endpoint returns two promotion fields: `promotions` (product-scoped) and `store_promotions` (store-wide). Both are arrays of `ProductPromotionSummaryDto` — or `null` if none exist.

### Shape in product responses

```json
{
  "id": "a0eebc99-...",
  "detalle": "Leche entera",
  "costo_final": "1500.00",
  "promotions": [
    {
      "id": "p0eebc99-...",
      "name": "10% OFF semana",
      "description": "Descuento especial de lunes a viernes",
      "scope": "product",
      "type": "percentage",
      "discount_percent": 10,
      "start_date": null,
      "end_date": null,
      "weekdays": [1, 2, 3, 4, 5]
    }
  ],
  "store_promotions": [
    {
      "id": "p1eebc99-...",
      "name": "15% OFF en toda la tienda",
      "description": "Promo fin de semana",
      "scope": "store",
      "type": "percentage",
      "discount_percent": 15,
      "start_date": "2026-07-10T00:00:00.000Z",
      "end_date": "2026-07-12T23:59:59.000Z",
      "weekdays": null
    }
  ],
  "...": "..."
}
```

### Key points

- `promotions` is `ProductPromotionSummaryDto[] | null`. Contains only **product-scoped** active promotions for that product. `null` when none exist.
- `store_promotions` is `ProductPromotionSummaryDto[] | null`. Contains **all** currently-active store-wide promotions (the SAME array across every product in the response). `null` when none exist.
- Only `enabled: true` promotions whose schedule is currently active are included.
- Each summary contains: `id`, `name`, `description`, `scope`, `type`, `discount_percent`, `start_date`, `end_date`, `weekdays`. All schedule fields are present — the backend already filtered to active ones.
- Appears on: `GET /products`, `GET /products?search=...`, `GET /products/:id`, `POST /products`, and `PUT /products/:id` responses.

### Frontend UX recommendation

- On product list cards: show promotion badges for `promotions` (e.g., "10% OFF" or "2x1"). For `store_promotions`, consider a store-wide banner or separate indicator.
- On product detail: show a small section listing active product promotions and active store promotions separately.
- Do not parse the schedule in the frontend to determine "currently valid" — the backend already filters to only active ones.
- **Estimate checkout discounts**: sum the estimated discount from `promotions` (best one, same tie-breaking as backend) + all discounts from `store_promotions`. Mark as "estimated" — the real result comes from the sale response.

## Sale behavior with promotions

### No preview endpoint

There is **no** `POST /sales/preview` endpoint. The recommended frontend approach:

1. **Before checkout**: show estimated discounts per item using the `promotions` and `store_promotions` data from product responses. Mark these as "Estimado" / "Estimated".
2. **At checkout**: send a normal `POST /sales` request — the backend resolves promotions automatically.
3. **After checkout**: read the real `discount_amount` and `applied_promotions` from the sale response. Discard the estimate.
4. **On error/review**: if the backend returns an error or the user changes items, re-estimate client-side.

### Sale creation (POST /sales)

The frontend sends the same `POST /sales` payload as before — no promotion fields in the request:

```json
{
  "items": [{ "product_id": "a0eebc99-...", "quantity": 3 }],
  "payment_methods": [{ "method": "cash", "amount": "3000.00" }]
}
```

Ad-hoc items use the same endpoint with a different sale item shape:

```json
{
  "items": [
    {
      "name": "Counter Service",
      "description": "Manual cashier entry for checkout testing",
      "unit_price": "199.99",
      "quantity": 2
    }
  ],
  "payment_methods": [{ "method": "cash", "amount": "399.98" }]
}
```

### What the frontend must NOT send

The frontend must **not** send any backend-owned pricing fields in the sale payload.

- Do **not** send `total`.
- Do **not** send `discount_amount`.
- Do **not** send `applied_promotions`.
- Do **not** send `applied_promotion_id` or `applied_promotion_type`.
- Do **not** send any "discount already applied" value as the source of truth.
- Do **not** send a frontend-generated synthetic `product_id` for ad-hoc items.

The frontend may estimate discounts locally for UX, but the backend is always the source of truth for the persisted sale total.

### Frontend validations before `POST /sales`

Before submitting the sale, the frontend should validate:

1. **Items**
   - at least one item exists
   - every catalog item has a valid `product_id`
   - every ad-hoc item has `name` and `unit_price`
   - every item has `quantity >= 1`

2. **Payment methods**
   - at least one allocation exists
   - every allocation has `method` and `amount`
   - `amount` is a valid money string
   - payment methods are not duplicated

3. **Payment consistency**
   - the sum of all `payment_methods[].amount` values matches the total currently shown in the checkout UI

4. **Split ticket consistency** (when used)
   - exactly two groups exist
   - labels are non-empty and unique
   - allocated quantities match the original sale items

5. **Invoice request flag**
   - send `invoice_requested: true` only when the cashier explicitly requested invoicing

### Example payload with estimated discounts in UI only

The UI may show an estimated product discount plus a store-wide discount, but the request still sends only items and payment methods:

```json
// UI-only estimate (not sent)
{
  "estimated_subtotal": "4500.00",
  "estimated_discount": "2475.00",
  "estimated_total": "2025.00"
}
```

```json
// Actual POST /sales payload
{
  "items": [
    {
      "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "quantity": 3
    }
  ],
  "payment_methods": [
    {
      "method": "cash",
      "amount": "2025.00"
    }
  ],
  "invoice_requested": false
}
```

The backend:

1. Resolves all active store-wide promotions + the best product promotion per item.
2. Computes the total discount amount (sum of all applied promotions).
3. Subtracts it from the item subtotal.
4. The `total` in the response is the **after-discount final total**.
5. Each sale item carries `discount_amount`, `applied_promotions` (stacked), plus legacy `applied_promotion_id` and `applied_promotion_type`.

### Ad-hoc items and promotions

- Ad-hoc items are included in sale-time promotion resolution so store-wide promotions can affect them.
- Effective product-scoped promotions are excluded from the ad-hoc item `applied_promotions` response.
- The backend stores a synthetic `product_id` for ad-hoc items. Treat it as opaque. It is not a real catalog product id and must not drive promotion lookups or product-detail navigation.
- For ad-hoc item discount UI, use `discount_amount` plus `applied_promotions` as the source of truth. The legacy `applied_promotion_id` / `applied_promotion_type` fields are not reliable for new ad-hoc-specific behavior.

### Sale item response with promotions

```json
{
  "id": "b1eebc99-...",
  "total": "2025.00",
  "items": [
    {
      "id": "d3eebc99-...",
      "product_id": "a0eebc99-...",
      "quantity": 3,
      "unit_price": "1500.00",
      "subtotal": "4500.00",
      "discount_amount": "2475.00",
      "applied_promotions": [
        {
          "promotion_id": "p0eebc99-...",
          "promotion_scope": "product",
          "promotion_type": "percentage",
          "discount_amount": "1800.00"
        },
        {
          "promotion_id": "p1eebc99-...",
          "promotion_scope": "store",
          "promotion_type": "percentage",
          "discount_amount": "675.00"
        }
      ],
      "applied_promotion_id": "p0eebc99-...",
      "applied_promotion_type": "percentage"
    }
  ]
}
```

### Discount field reference

| Field | Type | Meaning |
|-------|------|---------|
| `discount_amount` | string (money) | Total discount applied to this item (sum of all stacked promotions). `"0.00"` if none applied. |
| `applied_promotions` | array | Every promotion that contributed to the discount, sorted by amount descending. Each entry has `promotion_id`, `promotion_scope` (`"product" \| "store"`), `promotion_type`, and `discount_amount`. Empty array `[]` if none applied. |
| `applied_promotion_id` | string \| null | UUID of the winning **product** promotion (legacy field). `null` if no product promotion applied. |
| `applied_promotion_type` | string \| null | `"percentage"` or `"two_x_one"` of the winning product promotion (legacy field). `null` if none. |

> **Legacy fields**: `applied_promotion_id` and `applied_promotion_type` only reflect the best **product** promotion. Store-wide promotions are ONLY visible in `applied_promotions`. Prefer `applied_promotions` for new frontend code.

### Discount computation examples

| Type | Quantity | Unit price | Subtotal | Discount | Final |
|------|----------|------------|----------|----------|-------|
| percentage 10% | 3 | 1500.00 | 4500.00 | 450.00 | 4050.00 |
| percentage 25% | 2 | 1000.00 | 2000.00 | 500.00 | 1500.00 |
| two_x_one | 2 | 1000.00 | 2000.00 | 1000.00 (1 free) | 1000.00 |
| two_x_one | 3 | 1000.00 | 3000.00 | 1000.00 (1 free) | 2000.00 |
| two_x_one | 5 | 1000.00 | 5000.00 | 2000.00 (2 free) | 3000.00 |
| product 10% + store 15% | 2 | 1000.00 | 2000.00 | 200.00 + 300.00 = 500.00 | 1500.00 |

### Sale listing and detail

All sale endpoints (`GET /sales`, `GET /sales?page=...`, `GET /sales/:id`) return sale items with `discount_amount`, `applied_promotions`, `applied_promotion_id`, and `applied_promotion_type`. No extra query needed — the discount fields are always present.

### ARCA invoicing with promotions

When `invoice_requested: true`:

- The invoice voucher uses the **final `total`** (after discount). No change to the invoice flow.
- The `cbte_nro`, `cae`, etc. are unaffected by promotions.
- The sale detail view should still show the per-item discount breakdown for transparency.

## Frontend UX recommendations

### Promotions admin screen

| Screen | What it needs |
|--------|---------------|
| **List** | Table with columns: name, scope badge (`Tienda` / `Producto`), product name (join via `product_id` if scope is product), type badge, discount/schedule summary, enabled toggle. |
| **Create form** | Name (text), description (optional textarea), scope radio/select (`Producto` vs `Tienda`). Product picker (select/autocomplete) — visible only for `scope: "product"`. Type radio/select (`percentage` vs `two_x_one`), conditional `discount_percent` field (visible only for percentage). Schedule section: radio between "Date range" and "Weekdays", with the corresponding inputs. |
| **Edit form** | Pre-filled same as create. `scope` and `product_id` are read-only after creation. Add an `enabled` toggle. |
| **Disable confirmation** | "This will deactivate the promotion. It can be re-enabled later. Continue?" |

### Product list / catalog

- Products with `promotions.length > 0` (not `null`): show a product promotion badge on the product card.
- Products where `store_promotions.length > 0` (not `null`): show a store-wide promotion badge or banner.
- For percentage type: "10% OFF". For 2x1 type: "2x1".
- If multiple active product promotions exist, show the one with the highest `discount_percent` (for percentage) or prefer "2x1" badge. Alternatively, show all active badges.
- Do NOT attempt to recalculate the discount client-side — the badge is informational only.
- A product can have BOTH a product promotion badge AND a store promotion badge simultaneously.

### Checkout / cart

- The checkout does NOT send promotion data. Discount is automatic.
- You SHOULD show an estimated discount indicator per item (based on `promotions` + `store_promotions` data from product responses), but mark it as "estimated" — the actual discount is confirmed in the sale response.
- Estimation algorithm (client-side, to match backend behavior):
  - For product promotions: apply the same tie-breaking rules (largest discount, percentage beats 2x1, newest `updated_at` wins ties).
  - For store promotions: sum ALL active store-wide promotions.
  - Total estimated discount = best product discount + sum of all store discounts.
- If you show estimated discount: for percentage, use `subtotal * percent / 100`; for 2x1, use `unit_price * floor(quantity/2)`.

### Sale receipt / detail

- For each item with `discount_amount !== "0.00"`, show a discount summary line.
- Render each entry in `applied_promotions` as a discount row, tagged by scope: "Tienda: 15% OFF: -$300.00", "Producto: 10% OFF: -$200.00".
- Show the original subtotal, the discount breakdown, and the final charged amount.
- The `total` in the sale response is always the final charged amount — use it for receipt total, payment matching, and ARCA display.

## TypeScript interfaces

```typescript
// Promotions CRUD

type PromotionType = 'percentage' | 'two_x_one';
type PromotionScope = 'product' | 'store';

interface CreatePromotionRequest {
  name: string;                     // required, non-empty
  description?: string | null;      // optional
  scope?: PromotionScope;           // defaults to 'product'
  product_id?: string | null;       // required for 'product', must be null for 'store'
  type: PromotionType;
  discount_percent?: number | null; // 1–99, required for 'percentage', absent for 'two_x_one'
  start_date?: string | null;       // ISO 8601 with timezone
  end_date?: string | null;         // ISO 8601 with timezone
  weekdays?: number[] | null;       // [1..7], 1=Monday, 7=Sunday
}

interface UpdatePromotionRequest {
  name?: string;
  description?: string | null;
  scope?: PromotionScope;
  product_id?: string | null;
  type?: PromotionType;
  discount_percent?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  weekdays?: number[] | null;
  enabled?: boolean;
}

interface PromotionResponse {
  id: string;
  name: string;
  description: string | null;
  scope: PromotionScope;
  product_id: string | null;
  type: PromotionType;
  discount_percent: number | null;
  start_date: string | null;       // ISO 8601
  end_date: string | null;         // ISO 8601
  weekdays: number[] | null;
  enabled: boolean;
  created_at: string;              // ISO 8601
  updated_at: string;              // ISO 8601
}

// Product promotion summary (embedded in ProductResponse)

interface ProductPromotionSummary {
  id: string;
  name: string;
  description: string | null;
  scope: PromotionScope;
  type: PromotionType;
  discount_percent: number | null;
  start_date: string | null;       // ISO 8601 — always present, backend pre-filters to active
  end_date: string | null;         // ISO 8601
  weekdays: number[] | null;
}

// Updated ProductResponse (adds promotions + store_promotions)

interface ProductResponse {
  // ... existing fields from frontend-integration.md ...
  promotions: ProductPromotionSummary[] | null;
  store_promotions: ProductPromotionSummary[] | null;
}

// Applied promotion detail (in SaleItemResponse)

interface AppliedPromotion {
  promotion_id: string;
  promotion_scope: 'product' | 'store';
  promotion_type: PromotionType;
  discount_amount: string;          // money string, e.g. "450.00"
}

// Updated SaleItemResponse (adds discount fields)

interface SaleItemResponse {
  id: string;
  product_id: string | null;
  name?: string | null;
  description?: string | null;
  iva?: string | null;
  quantity: number;
  unit_price: string;
  subtotal: string;
  // Discount fields — always present
  discount_amount: string;                  // "0.00" if no promotion applied
  applied_promotions: AppliedPromotion[];   // [] if no promotion applied
  applied_promotion_id: string | null;      // legacy — best product promotion only
  applied_promotion_type: PromotionType | null; // legacy
}

// SaleResponse is unchanged beyond SaleItemResponse — no new top-level fields.
```

## Fetch / Axios examples

### Fetch

```typescript
const API = 'http://localhost:3000/api/v1';

// Create a promotion
async function createPromotion(
  token: string,
  request: CreatePromotionRequest,
): Promise<PromotionResponse> {
  const res = await fetch(`${API}/promotions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}

// Create a store-wide promotion
async function createStorePromotion(
  token: string,
  name: string,
  discountPercent: number,
  weekdays: number[],
): Promise<PromotionResponse> {
  return createPromotion(token, {
    name,
    scope: 'store',
    type: 'percentage',
    discount_percent: discountPercent,
    weekdays,
  });
}

// List all promotions
async function listPromotions(token: string): Promise<PromotionResponse[]> {
  const res = await fetch(`${API}/promotions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}

// Update (partial)
async function updatePromotion(
  token: string,
  id: string,
  request: UpdatePromotionRequest,
): Promise<PromotionResponse> {
  const res = await fetch(`${API}/promotions/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}

// Soft-disable
async function disablePromotion(
  token: string,
  id: string,
): Promise<void> {
  const res = await fetch(`${API}/promotions/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message);
  }
}

// Estimate discount for a product (client-side, informational only)
function estimateDiscount(
  item: { quantity: number; unit_price: string },
  promotions: ProductPromotionSummary[],
  storePromotions: ProductPromotionSummary[],
): { totalDiscount: number; breakdown: { name: string; scope: string; amount: number }[] } {
  const unitPrice = parseFloat(item.unit_price);
  const subtotal = unitPrice * item.quantity;
  const breakdown: { name: string; scope: string; amount: number }[] = [];

  // Best product promotion
  let bestProductDiscount = 0;
  let bestProductName = '';
  for (const p of promotions) {
    let d = 0;
    if (p.type === 'percentage' && p.discount_percent) {
      d = subtotal * p.discount_percent / 100;
    } else if (p.type === 'two_x_one') {
      const free = Math.floor(item.quantity / 2);
      d = unitPrice * free;
    }
    if (d > bestProductDiscount) {
      bestProductDiscount = d;
      bestProductName = p.name;
    }
  }
  if (bestProductDiscount > 0) {
    breakdown.push({ name: bestProductName, scope: 'product', amount: bestProductDiscount });
  }

  // All store promotions
  let storeDiscountTotal = 0;
  for (const p of storePromotions) {
    let d = 0;
    if (p.type === 'percentage' && p.discount_percent) {
      d = subtotal * p.discount_percent / 100;
    } else if (p.type === 'two_x_one') {
      const free = Math.floor(item.quantity / 2);
      d = unitPrice * free;
    }
    if (d > 0) {
      storeDiscountTotal += d;
      breakdown.push({ name: p.name, scope: 'store', amount: d });
    }
  }

  return {
    totalDiscount: bestProductDiscount + storeDiscountTotal,
    breakdown,
  };
}
```

### Axios

```typescript
async function listPromotions(): Promise<PromotionResponse[]> {
  const { data } = await api.get('/promotions');
  return data;
}

async function enablePromotion(id: string): Promise<PromotionResponse> {
  const { data } = await api.put(`/promotions/${id}`, { enabled: true });
  return data;
}
```

## Edge cases and caveats

### Schedule edge cases

- **Weekday promotion on weekdays outside the date range**: A weekday promotion is always active on those days — it has no end date. If you want a one-week sale, use date range, not weekdays.
- **Date range without time**: `start_date` and `end_date` are `timestamptz`. If you send `"2026-07-01"` without a time component, the backend treats it as midnight UTC (`00:00:00.000Z`). Since schedule checks use Buenos Aires time (UTC-3), a date range of `"2026-07-01"` to `"2026-07-01"` would only cover one second at midnight ART. **Always include a time component with timezone** for date ranges, e.g., `"2026-07-01T00:00:00.000-03:00"`.
- **Overlapping schedules**: A product can have multiple active product promotions — the backend picks the best one. A product can also have multiple store-wide promotions applied simultaneously. The admin UI should make it visible when a product has multiple active promotions.

### Stacking behavior

- **Store + product stacking**: A store-wide 15% and a product 10% both apply. The item gets both discounts added together.
- **Multiple store-wide promotions**: ALL active store-wide promotions apply. If there are two store-wide promotions (e.g., 10% on weekdays + 5% all week), both stack on the same item.
- **Product promotions don't stack with each other**: Only the best single product promotion wins per item.
- **Store-wide 2x1**: A store-wide 2x1 promotion applies to every product in every sale. Use with caution — it can dramatically reduce revenue. The admin UI should warn about this.

### Discount edge cases

- **`discount_amount: "0.00"`**: This is the default when no promotion applies. Do not hide the line — always show it so the sale receipt structure is consistent.
- **`applied_promotions: []`**: Empty array when no promotion applies. Not `null`.
- **Quantity = 1 with 2x1**: `floor(1 / 2) = 0` → no free units → discount = `"0.00"`. The 2x1 effectively does nothing for odd/single quantities.
- **Negative prices**: While the MVP does not produce negative prices, if a product has `costo_final: "0.00"`, the discount is computed as `0.00 * quantity * percent / 100 = "0.00"`.
- **Discount > subtotal**: Not possible with 1–99% ranges, but combined product + store promotions or 2x1 could make the final near-zero (e.g., qty=2, unit_price=100, 2x1 discount=100). The backend does not cap discounts — the final item could be free.

### UI edge cases

- **Toggle from list**: If you show an `enabled` toggle in the promotions list, use `PUT /promotions/:id { "enabled": false }` — not `DELETE`. `DELETE` is a no-recovery path from the list perspective (you'd need a separate "Re-enable" action that calls PUT).
- **Product deleted after promotion created**: The promotion stays in the DB but will never match a sale item (product lookup fails). The admin list screen should handle products that no longer exist gracefully — the `promotions` response only has `product_id`, no product name. You'll need to join via `GET /products/:id` or maintain a product name cache.
- **Ad-hoc sale item IDs**: Ad-hoc item `product_id` values in sale responses are synthetic. Never treat them as product records or use them in catalog routes.
- **GET /promotions includes disabled ones**: Your admin list screen should visually distinguish enabled vs disabled (e.g., grayed out row, disabled badge). The list endpoint returns everything.
- **No delete confirmation on backend**: `DELETE` is a soft-disable, not a destructive operation. The confirmation dialog message should reflect this: "Deactivate" rather than "Delete permanently".
- **`store_promotions` is the same for every product**: In a list response, every product object contains the identical `store_promotions` array. You can read it from the first product and reuse it. Don't re-render store promotion badges per card unnecessarily.
- **Store-wide scope UI**: The admin form should clearly distinguish between product-scoped and store-wide promotions. Store-wide promotions affect every product — show a warning or confirmation before creating one.

### Integration checklist for promotions

- [ ] Promotions admin list screen shows all promotions with name, scope badge, product name, type, schedule, and enabled state.
- [ ] Create form enforces: scope selector (product/store), with product_id field visible only for product scope.
- [ ] Create form enforces: percentage → discount_percent visible; 2x1 → discount_percent hidden.
- [ ] Create form enforces: schedule radio (date range OR weekdays) with corresponding input groups.
- [ ] Store-wide promotion creation shows a confirmation/warning about affecting all products.
- [ ] Product list cards show product promotion badges ("10% OFF" / "2x1") when `promotions.length > 0`.
- [ ] Product list cards show store-wide promotion indicator when `store_promotions.length > 0`.
- [ ] Checkout shows estimated discount per item (from `promotions` + `store_promotions`), marked as "Estimado".
- [ ] Checkout does NOT send promotion data — discount is automatic.
- [ ] Checkout treats ad-hoc items as eligible only for store-wide discount estimation, never product-scoped estimation.
- [ ] Sale detail shows `applied_promotions` breakdown (scope + type + amount) for each item with `discount_amount !== "0.00"`.
- [ ] Sale detail falls back to legacy `applied_promotion_id` / `applied_promotion_type` for product-only display if needed.
- [ ] Sale receipt uses `total` (already discounted) for the final amount.
- [ ] ARCA invoice display uses `total` — no special treatment needed.
- [ ] `204 No Content` is handled for DELETE (no JSON body).
- [ ] `400` validation errors are surfaced inline in the create/edit forms.
- [ ] `404 Not Found` is handled for missing promotions on update/disable.
- [ ] `401 Unauthorized` is handled (expired/missing token).

## Next step

Build the promotions admin screen (with store-wide support), then test sale creation with both product and store-wide promotions active to verify stacking behavior and discount amounts in sale responses. Run the Bruno collection for end-to-end validation.
