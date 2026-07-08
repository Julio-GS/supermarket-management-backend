# Promotions — Frontend Integration Guide

This guide covers everything frontend developers need to build a Promotions admin screen and understand how active promotions affect product display, checkout, and sale history.

It assumes you already have auth, product, and sale flows working. See [`frontend-integration.md`](./frontend-integration.md) for the full API reference and [`sales-and-reports-integration.md`](./sales-and-reports-integration.md) for payment allocations and reports.

## Quick path

1. `GET /promotions` to list all promotions (no pagination — returns the full array).
2. `POST /promotions` to create a promotion for a product.
3. `PUT /promotions/:id` to edit or toggle on/off.
4. `DELETE /promotions/:id` soft-disables it (sets `enabled: false`).
5. Product responses now carry an embedded `promotions` summary; show active badges on product cards.
6. Sale responses now carry `discount_amount`, `applied_promotion_id`, and `applied_promotion_type` per item; show discount rows in sale detail.

## Core concepts

Promotions are **automatic, non-stacking, and product-scoped**. The frontend does NOT select or apply promotions during checkout — the backend resolves everything at sale creation time.

| Concept | Behavior |
|---------|----------|
| Automatic | Backend picks the best active promotion for each sale item during `POST /sales`. No frontend action needed. |
| Non-stacking | At most ONE promotion applies per sale item — the one that gives the biggest discount. |
| Product-scoped | Each promotion targets exactly one `product_id`. |
| No stock effect | Promotions do NOT alter stock; only discounts the sale price. |
| Invoicing | ARCA invoices use the final `total`. Discount detail is visible in the sale, not embedded in the invoice voucher. |

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

### How the backend picks the winner (tie-breaking)

At checkout, for each sale item:

1. Find all `enabled` promotions for that `product_id` whose schedule is currently active.
2. Compute the monetary discount amount each would yield.
3. Pick the one with the largest discount amount.
4. If amounts are equal: **percentage beats 2-for-1**.
5. If same type with equal amounts: the **newest `updated_at`** wins.
6. If no promotion qualifies, the item gets no discount (`discount_amount: "0.00"`).

## Endpoints

All endpoints are prefixed with `POST/PUT` and return a `PromotionResponse` object. `DELETE /promotions/:id` returns `204 No Content` on successful soft-deactivation. All routes require the bearer token (`Authorization: Bearer <token>`).

| Method | Path | What it does |
|--------|------|-------------|
| `POST` | `/promotions` | Create a new promotion (enabled by default). |
| `GET` | `/promotions` | List all promotions (no pagination). |
| `PUT` | `/promotions/:id` | Update any field, including toggling `enabled`. |
| `DELETE` | `/promotions/:id` | Soft-disable (`enabled: false`). Hard delete is not exposed. |

### Create a promotion

`POST /promotions`

```json
// Request — percentage discount, Mon–Fri
{
  "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "type": "percentage",
  "discount_percent": 10,
  "weekdays": [1, 2, 3, 4, 5]
}
```

```json
// Request — 2-for-1 with date range
{
  "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "type": "two_x_one",
  "start_date": "2026-07-01T00:00:00.000Z",
  "end_date": "2026-07-31T23:59:59.000Z"
}
```

```json
// Response 201 Created
{
  "id": "p0eebc99-9c0b-4ef8-bb6d-6bb9bd380a88",
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
    "product_id": "a0eebc99-...",
    "type": "two_x_one",
    "discount_percent": null,
    "start_date": "2026-07-01T00:00:00.000Z",
    "end_date": "2026-07-31T23:59:59.000Z",
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

You can change `type`, add/remove `discount_percent`, switch between date range and weekdays, or toggle `enabled`. The same cross-field validation rules apply as on create.

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
| `type: "percentage"` requires `discount_percent` (1–99, integer). | "percentage type requires discount_percent (1-99); two_x_one must NOT have discount_percent" |
| `type: "two_x_one"` must NOT have `discount_percent`. | Same as above. |
| Must provide either (`start_date` + `end_date`) with `start_date <= end_date`, OR `weekdays` array (min 1 element). | "Either a date range (start_date + end_date with start <= end) or weekdays (1-7) must be provided" |
| `weekdays` elements must be integers 1–7, no duplicates. | class-validator messages for `@Min`, `@Max`, `@ArrayUnique`. |

### Field-level rules

| Field | Create | Update | Type | Constraints |
|-------|--------|--------|------|-------------|
| `product_id` | required | — (immutable) | UUID string | Must be a valid product UUID. |
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

Every product endpoint now returns a `promotions` field. This is an array of **active** promotion summaries for that product — or `null` if none exist.

### Shape in product responses

```json
{
  "id": "a0eebc99-...",
  "detalle": "Leche entera",
  "costo_final": "1500.00",
  "promotions": [
    {
      "id": "p0eebc99-...",
      "type": "percentage",
      "discount_percent": 10,
      "weekdays": [1, 2, 3, 4, 5]
    }
  ],
  "...": "..."
}
```

### Key points

- `promotions` is `ProductPromotionSummaryDto[] | null`. It is `null` when no active promotions exist for that product.
- Only `enabled: true` promotions whose schedule is currently active are included.
- The summary is a **subset** of the full promotion object — it contains `id`, `type`, `discount_percent` (nullable), and `weekdays` (nullable). It does NOT include `start_date`/`end_date`.
- Appears on: `GET /products`, `GET /products?search=...`, `GET /products/:id`, `POST /products`, and `PUT /products/:id` responses.

### Frontend UX recommendation

- On product list cards: show a colored badge/tag for products with active promotions (e.g., "10% OFF" or "2x1").
- On product detail: show a small row listing active promotions with type, discount, and schedule hint.
- Do not parse the schedule in the frontend to determine "currently valid" — the backend already filters to only active ones.

## Sale behavior with promotions

### Sale creation (POST /sales)

The frontend sends the same `POST /sales` payload as before — no promotion fields in the request:

```json
{
  "items": [{ "product_id": "a0eebc99-...", "quantity": 3 }],
  "payment_methods": [{ "method": "cash", "amount": "3000.00" }]
}
```

The backend:

1. Resolves the best promotion per item automatically.
2. Computes the discount amount.
3. Subtracts it from the item subtotal.
4. The `total` in the response is the **after-discount final total**.
5. Each sale item carries the discount detail in `discount_amount`, `applied_promotion_id`, and `applied_promotion_type`.

### Sale item response with promotion

```json
{
  "id": "b1eebc99-...",
  "total": "2700.00",
  "items": [
    {
      "id": "d3eebc99-...",
      "product_id": "a0eebc99-...",
      "quantity": 3,
      "unit_price": "1500.00",
      "subtotal": "4500.00",
      "discount_amount": "300.00",
      "applied_promotion_id": "p0eebc99-...",
      "applied_promotion_type": "percentage"
    }
  ]
}
```

### Discount field reference

| Field | Type | Meaning |
|-------|------|---------|
| `discount_amount` | string (money) | Discount applied to this item. `"0.00"` if no promotion qualified. |
| `applied_promotion_id` | string \| null | UUID of the winning promotion. `null` if none applied. |
| `applied_promotion_type` | string \| null | `"percentage"` or `"two_x_one"`. `null` if none applied. |

### Discount computation examples

| Type | Quantity | Unit price | Subtotal | Discount | Final |
|------|----------|------------|----------|----------|-------|
| percentage 10% | 3 | 1500.00 | 4500.00 | 450.00 | 4050.00 |
| percentage 25% | 2 | 1000.00 | 2000.00 | 500.00 | 1500.00 |
| two_x_one | 2 | 1000.00 | 2000.00 | 1000.00 (1 free) | 1000.00 |
| two_x_one | 3 | 1000.00 | 3000.00 | 1000.00 (1 free) | 2000.00 |
| two_x_one | 5 | 1000.00 | 5000.00 | 2000.00 (2 free) | 3000.00 |

### Sale listing and detail

All sale endpoints (`GET /sales`, `GET /sales/...?page=...`, `GET /sales/:id`) return sale items with `discount_amount`, `applied_promotion_id`, and `applied_promotion_type`. No extra query needed — the discount fields are always present.

### ARCA invoicing with promotions

When `invoice_requested: true`:

- The invoice voucher uses the **final `total`** (after discount). No change to the invoice flow.
- The `cbte_nro`, `cae`, etc. are unaffected by promotions.
- The sale detail view should still show the per-item discount breakdown for transparency.

## Frontend UX recommendations

### Promotions admin screen

| Screen | What it needs |
|--------|---------------|
| **List** | Table with columns: product name (join via `product_id`), type badge, discount/schedule summary, enabled toggle. |
| **Create form** | Product picker (select/autocomplete from product list), type radio/select (`percentage` vs `two_x_one`), conditional `discount_percent` field (visible only for percentage), schedule section: radio between "Date range" and "Weekdays", with the corresponding inputs. |
| **Edit form** | Pre-filled same as create. `product_id` is read-only. Add an `enabled` toggle. |
| **Disable confirmation** | "This will deactivate the promotion. It can be re-enabled later. Continue?" |

### Product list / catalog

- Products with `promotions.length > 0` (i.e., not `null`): show a promotion badge on the product card.
- For percentage type: "10% OFF".
- For 2x1 type: "2x1".
- If multiple active promotions exist, show the one with the highest `discount_percent` (for percentage) or prefer "2x1" badge. Alternatively, show all active badges.
- Do NOT attempt to recalculate the discount client-side — the badge is informational only.

### Checkout / cart

- The checkout does NOT send promotion data. Discount is automatic.
- You MAY show an estimated discount indicator per item (based on `promotions` data from product response), but mark it as "estimated" — the actual discount is confirmed in the sale response.
- If you show estimated discount: for percentage, use `subtotal * percent / 100`; for 2x1, use `unit_price * floor(quantity/2)`.

### Sale receipt / detail

- For each item with `discount_amount !== "0.00"`, show a discount line: "10% OFF: -$300.00".
- Show the original subtotal, the discount, and the final charged amount.
- The `total` in the sale response is always the final charged amount — use it for receipt total, payment matching, and ARCA display.

## TypeScript interfaces

```typescript
// Promotions CRUD

type PromotionType = 'percentage' | 'two_x_one';

interface CreatePromotionRequest {
  product_id: string;           // UUID
  type: PromotionType;
  discount_percent?: number;    // 1–99, required for 'percentage', absent for 'two_x_one'
  start_date?: string | null;   // ISO 8601 with timezone
  end_date?: string | null;     // ISO 8601 with timezone
  weekdays?: number[] | null;   // [1..7], 1=Monday, 7=Sunday
}

interface UpdatePromotionRequest {
  type?: PromotionType;
  discount_percent?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  weekdays?: number[] | null;
  enabled?: boolean;
}

interface PromotionResponse {
  id: string;
  product_id: string;
  type: PromotionType;
  discount_percent: number | null;
  start_date: string | null;    // ISO 8601
  end_date: string | null;      // ISO 8601
  weekdays: number[] | null;
  enabled: boolean;
  created_at: string;           // ISO 8601
  updated_at: string;           // ISO 8601
}

// Product promotions summary (embedded in ProductResponse)

interface ProductPromotionSummary {
  id: string;
  type: PromotionType;
  discount_percent: number | null;
  weekdays: number[] | null;
}

// Updated ProductResponse (adds promotions field)

interface ProductResponse {
  // ... existing fields from frontend-integration.md ...
  promotions: ProductPromotionSummary[] | null;
}

// Updated SaleItemResponse (adds discount fields)

interface SaleItemResponse {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  // NEW — always present
  discount_amount: string;              // "0.00" if no promotion applied
  applied_promotion_id: string | null;
  applied_promotion_type: PromotionType | null;
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
- **Overlapping schedules on the same product**: If a product has two promotions both active, the backend picks the one that gives the biggest monetary discount per item at sale time. This is deterministic but may surprise operators — the admin UI should make it visible when a product has multiple active promotions.

### Discount edge cases

- **`discount_amount: "0.00"`**: This is the default when no promotion applies. Do not hide the line — always show it so the sale receipt structure is consistent.
- **Quantity = 1 with 2x1**: `floor(1 / 2) = 0` → no free units → discount = `"0.00"`. The 2x1 effectively does nothing for odd/single quantities.
- **Negative prices**: While the MVP does not produce negative prices, if a product has `costo_final: "0.00"`, the discount is computed as `0.00 * quantity * percent / 100 = "0.00"`.
- **Discount > subtotal**: Not possible with 1–99% ranges, but 2x1 could theoretically make the final near-zero (e.g., qty=2, unit_price=100 → discount=100). The backend does not cap discounts — the final item could be free.

### UI edge cases

- **Toggle from list**: If you show an `enabled` toggle in the promotions list, use `PUT /promotions/:id { "enabled": false }` — not `DELETE`. `DELETE` is a no-recovery path from the list perspective (you'd need a separate "Re-enable" action that calls PUT).
- **Product deleted after promotion created**: The promotion stays in the DB but will never match a sale item (product lookup fails). The admin list screen should handle products that no longer exist gracefully — the `promotions` response only has `product_id`, no product name. You'll need to join via `GET /products/:id` or maintain a product name cache.
- **GET /promotions includes disabled ones**: Your admin list screen should visually distinguish enabled vs disabled (e.g., grayed out row, disabled badge). The list endpoint returns everything.
- **No delete confirmation on backend**: `DELETE` is a soft-disable, not a destructive operation. The confirmation dialog message should reflect this: "Deactivate" rather than "Delete permanently".

### Integration checklist for promotions

- [ ] Promotions admin list screen shows all promotions with product name, type, schedule, and enabled state.
- [ ] Create form enforces: percentage → discount_percent visible; 2x1 → discount_percent hidden.
- [ ] Create form enforces: schedule radio (date range OR weekdays) with corresponding input groups.
- [ ] Edit form pre-fills all fields and allows toggling `enabled`.
- [ ] Product list cards show "10% OFF" / "2x1" badges when `promotions.length > 0`.
- [ ] Checkout does NOT send promotion data — discount is automatic.
- [ ] Sale detail shows discount rows for each item with `discount_amount !== "0.00"`.
- [ ] Sale receipt uses `total` (already discounted) for the final amount.
- [ ] ARCA invoice display uses `total` — no special treatment needed.
- [ ] `204 No Content` is handled for DELETE (no JSON body).
- [ ] `400` validation errors are surfaced inline in the create/edit forms.
- [ ] `404 Not Found` is handled for missing promotions on update/disable.
- [ ] `401 Unauthorized` is handled (expired/missing token).
```

## Next step

Build the promotions admin screen, then test sale creation with active promotions to verify discount amounts appear correctly in sale responses. Run the Bruno collection for end-to-end validation.
