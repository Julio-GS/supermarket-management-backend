# Ad-Hoc Sale Items — Frontend Integration Guide

This guide explains exactly how the frontend should integrate ad-hoc sale items in `POST /sales`. Use it when the cashier needs to sell something that is **not** a persisted catalog product but still must be included in the same checkout, promotion, split-ticket, and invoice flow.

It assumes auth and the regular sales flow already work. For the full API guide, see [`frontend-integration.md`](./frontend-integration.md). For promotion details, see [`promotions-frontend-integration.md`](./promotions-frontend-integration.md).

## Quick path

1. Model checkout items as a frontend union: catalog item or ad-hoc item.
2. Send ad-hoc items only when the cashier adds a non-catalog line at checkout.
3. For ad-hoc items, send `name`, optional `description`, `unit_price`, and `quantity`.
4. Do **not** send `product_id` or `iva` for ad-hoc items.
5. If split-ticket is needed for ad-hoc items, prefer per-item `split_ticket` over top-level `split_ticket_groups`.
6. Treat response `product_id` for ad-hoc lines as opaque backend data, not as a catalog product id.
7. Read discounts from `discount_amount` and `applied_promotions`; ad-hoc items can receive store-wide promotions, not product-specific ones.

## What ad-hoc sale items are

Ad-hoc sale items are checkout lines that do not come from `products` and are not inserted into the product catalog.

Typical examples:

- A one-off cashier charge.
- A service line.
- A manual item the store wants to sell once without creating a catalog product.

They still belong to the normal sale lifecycle:

- They are sent through `POST /sales`.
- They contribute to the computed sale `total`.
- They can be included in split-ticket sales.
- They can be invoiced.
- They can receive store-wide promotions.

## When the frontend should send them

Send an ad-hoc item only when the cashier intentionally creates a non-catalog line during checkout.

Do not send ad-hoc items when:

- The item already exists in the catalog.
- The frontend can resolve a real product selection and `product_id`.
- The cashier is selling a special catalog product with `pricing_mode: "manual"`. That is still a catalog item, not an ad-hoc item.

## Request contract

`POST /sales`

The backend accepts a mixed `items` array. Each element must be exactly one source:

- Catalog-backed item.
- Ad-hoc item.

Never send both shapes on the same item.

### Catalog item shapes

There are two catalog cases the frontend should distinguish.

| Case | When to use | Required fields | Forbidden fields | Notes |
|------|-------------|-----------------|------------------|-------|
| Fixed-price catalog item | Normal product with `pricing_mode: "fixed"` | `product_id`, `quantity` | `name`, `unit_price`, ad-hoc `description`; `line_total` should be omitted | Backend uses the catalog price. |
| Manual-price catalog item | Product with `pricing_mode: "manual"` | `product_id`, `quantity: 1`, `line_total` | `name`, `unit_price`, ad-hoc `description` | Still a catalog item. Price comes from the checkout line total. |

Fixed-price catalog example:

```json
{
  "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "quantity": 2
}
```

Manual-price catalog example:

```json
{
  "product_id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  "quantity": 1,
  "line_total": "350.00"
}
```

### Ad-hoc item shape

Required request shape:

```json
{
  "name": "Counter Service",
  "description": "Manual cashier entry for checkout testing",
  "unit_price": "199.99",
  "quantity": 2
}
```

Ad-hoc rules:

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Non-empty string. |
| `description` | no | Optional free text. |
| `unit_price` | yes | Money string, must be greater than `0`. |
| `quantity` | yes | Integer `>= 1`. |
| `product_id` | no | Must be omitted for ad-hoc items. |
| `iva` | no | Must be omitted; backend persists a fixed IVA of `21.00`. |
| `line_total` | no | Not part of the ad-hoc contract. Use `unit_price` + `quantity`. |

### Full mixed request example

```json
{
  "items": [
    {
      "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "quantity": 1
    },
    {
      "name": "Counter Service",
      "description": "Manual cashier entry for checkout testing",
      "unit_price": "199.99",
      "quantity": 2
    }
  ],
  "payment_methods": [
    { "method": "cash", "amount": "399.98" },
    { "method": "card", "amount": "121.00" }
  ],
  "invoice_requested": false
}
```

## Validation rules

### Source exclusivity

Each request item must be one of these, never both:

- Catalog-backed: `product_id` present, ad-hoc fields absent.
- Ad-hoc: `name` + `unit_price` present, `product_id` absent.

If the frontend mixes them in one item, the backend rejects the request.

### Ad-hoc validation

| Rule | Behavior |
|------|----------|
| `name` required | Empty or missing names are rejected. |
| `unit_price` required | Empty or missing `unit_price` is rejected. |
| Positive price | `unit_price` must be `> 0`. |
| Integer quantity | `quantity` must be an integer `>= 1`. |
| No client IVA | Frontend must not send IVA for ad-hoc lines. |

### Catalog validation that still matters

| Rule | Behavior |
|------|----------|
| `product_id` must exist | Unknown catalog ids return `404`. |
| Fixed-price item cannot send `line_total` | The backend rejects it. |
| Manual-price item requires `line_total` | Missing or non-positive `line_total` is rejected. |
| Manual-price item requires `quantity = 1` | Any other quantity is rejected. |
| Invoice on non-facturable catalog product | Rejected when `invoice_requested: true`. |

### Payment and sale-level validation

| Rule | Behavior |
|------|----------|
| `items` must be non-empty | Empty sale requests fail. |
| `payment_methods` must be non-empty | At least one allocation is required. |
| Payment method values | Allowed: `cash`, `transfer`, `card`, `qr`. |
| Payment method uniqueness | Each method can appear only once. |
| Allocation sum | Backend does **not** verify that `payment_methods[].amount` matches sale `total`; the frontend should validate this in the UI. |

## Frontend type modeling

Prefer a discriminated union in frontend state, even though the API uses structural validation.

```typescript
type PaymentMethod = 'cash' | 'transfer' | 'card' | 'qr';

interface PaymentMethodAllocation {
  method: PaymentMethod;
  amount: string;
}

interface CatalogFixedSaleItemDraft {
  kind: 'catalog-fixed';
  product_id: string;
  quantity: number;
}

interface CatalogManualSaleItemDraft {
  kind: 'catalog-manual';
  product_id: string;
  quantity: 1;
  line_total: string;
}

interface AdHocSaleItemDraft {
  kind: 'ad-hoc';
  name: string;
  description?: string;
  unit_price: string;
  quantity: number;
}

type SaleItemDraft =
  | CatalogFixedSaleItemDraft
  | CatalogManualSaleItemDraft
  | AdHocSaleItemDraft;

interface ItemSplitTicketDraft {
  group_1_quantity: number;
  group_2_quantity: number;
}
```

Serialize that draft union into the backend contract only at submit time.

```typescript
type CreateSaleItemRequest =
  | { product_id: string; quantity: number; line_total?: string; split_ticket?: ItemSplitTicketDraft }
  | { name: string; description?: string; unit_price: string; quantity: number; split_ticket?: ItemSplitTicketDraft };

interface CreateSaleRequest {
  items: CreateSaleItemRequest[];
  payment_methods: PaymentMethodAllocation[];
  split_ticket_groups?: {
    label: string;
    items: { product_id: string; quantity: number }[];
  }[];
  invoice_requested?: boolean;
}
```

Why this matters:

- The UI can render different editors cleanly.
- Validation messages can be specific per item kind.
- You avoid accidentally mixing `product_id` with ad-hoc fields.

## Rendering and editing before submit

Treat ad-hoc items as local checkout draft state until the final `POST /sales`.

Recommended UI behavior:

- Show ad-hoc lines in the same checkout list as catalog lines.
- Render editable fields for `name`, `description`, `unit_price`, and `quantity`.
- Recompute line subtotal locally as `unit_price * quantity` for preview purposes.
- Let the cashier remove or edit ad-hoc lines freely before submit.
- Do not try to persist or sync ad-hoc lines independently.

Recommended row rendering:

| Field | Catalog item | Ad-hoc item |
|-------|--------------|-------------|
| Primary label | Catalog product name | `name` draft field |
| Secondary text | Product metadata/barcodes if useful | Optional `description` |
| Price editor | Usually read-only for fixed products | Editable `unit_price` |
| Quantity editor | Editable | Editable |
| IVA display | From product if needed | Optional UI note: fixed `21%` |

Important caveat:

- The frontend should not invent a fake `product_id` for ad-hoc rows.
- The backend generates a synthetic UUID internally when it persists the sale.
- Until the sale is submitted, the row identity should be a frontend-only local id, for example `draft_id`.

## Split-ticket behavior

Ad-hoc items are compatible with split-ticket sales, but the request shape matters.

### Prefer per-item `split_ticket` for ad-hoc lines

If a sale includes ad-hoc items and the cashier wants a split ticket, prefer item-level `split_ticket` inside each `items[]` element:

```json
{
  "items": [
    {
      "name": "Counter Service",
      "unit_price": "200.00",
      "quantity": 2,
      "split_ticket": {
        "group_1_quantity": 1,
        "group_2_quantity": 1
      }
    }
  ],
  "payment_methods": [
    { "method": "cash", "amount": "400.00" }
  ]
}
```

Why: top-level `split_ticket_groups` references items by `product_id`, and ad-hoc items do not have a client-known `product_id` before submission.

### Use top-level `split_ticket_groups` only when the frontend knows all item product ids

This works well for catalog-only sales:

```json
{
  "items": [
    {
      "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "quantity": 2
    }
  ],
  "split_ticket_groups": [
    {
      "label": "A",
      "items": [
        { "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "quantity": 1 }
      ]
    },
    {
      "label": "B",
      "items": [
        { "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "quantity": 1 }
      ]
    }
  ],
  "payment_methods": [
    { "method": "cash", "amount": "242.00" }
  ]
}
```

Split-ticket rules:

- Use either top-level `split_ticket_groups` or per-item `split_ticket`, not both.
- Split-ticket still produces one sale, one payment allocation set, and one invoice flow.
- Both groups must contain allocations.
- Quantities must add up exactly to the ordered quantities.

## Promotions behavior

Promotions are automatic at `POST /sales` time.

For ad-hoc items:

- Store-wide promotions: **yes**.
- Product-specific promotions: **no**.

What the frontend should do:

- Do not try to choose promotions manually.
- Read `discount_amount` as the authoritative final discount for the line.
- Read `applied_promotions` as the authoritative breakdown.
- Treat legacy `applied_promotion_id` and `applied_promotion_type` as backward-compatible fields, not the main discount source.

Example response fragment for an ad-hoc item with a store-wide promotion:

```json
{
  "id": "sale-item-1",
  "product_id": "c2f8c3f7-6f56-4a3a-8e3d-2ac0c754cb0f",
  "name": "Counter Service",
  "description": "Manual cashier entry for checkout testing",
  "iva": "21.00",
  "quantity": 2,
  "unit_price": "250.00",
  "subtotal": "480.00",
  "discount_amount": "20.00",
  "applied_promotions": [
    {
      "promotion_id": "store-promo-10",
      "promotion_scope": "store",
      "promotion_type": "percentage",
      "discount_amount": "20.00"
    }
  ],
  "applied_promotion_id": null,
  "applied_promotion_type": null
}
```

## Response interpretation

### Ad-hoc `product_id` is opaque

When the sale comes back, ad-hoc lines include a `product_id` value. Treat it as an opaque backend identifier only.

Do:

- Use it only for sale-detail rendering.
- Use it as a stable identifier inside returned sale data.
- Accept it in returned split-ticket groups.

Do not:

- Use it to fetch `/products/:id`.
- Assume it exists in the product catalog.
- Persist it as if it were a reusable catalog product reference.

### `name`, `description`, and `iva`

For ad-hoc responses:

- `name` is the display label the cashier entered.
- `description` is optional descriptive text.
- `iva` is persisted as `"21.00"`.

### `subtotal` and discount fields

Interpret sale item pricing like this:

| Field | Meaning |
|-------|---------|
| `unit_price` | The per-unit value stored for the line. |
| `subtotal` | The final stored line subtotal after discount resolution. |
| `discount_amount` | The total discount applied to that line. |
| `applied_promotions` | Full applied promotion breakdown. |

## Invoice and ticket behavior

Ad-hoc items are invoice-compatible.

Rules that matter:

- When `invoice_requested: true`, ad-hoc items are treated as facturable.
- Their IVA rate is fixed at `21.00`.
- Frontend must not ask the cashier to choose an IVA rate for ad-hoc lines.
- Split-ticket does not create multiple invoice flows; the sale still has one invoice status.

Invoice UI guidance:

- Use the same invoice toggle for mixed sales and ad-hoc-only sales.
- Show invoice result fields from the top-level sale response, not from individual items.
- Keep UI defensive for `invoice_status: "none" | "issued" | "failed"`.

Example request with invoice:

```json
{
  "items": [
    {
      "name": "Counter Service",
      "unit_price": "500.00",
      "quantity": 1
    }
  ],
  "payment_methods": [
    { "method": "cash", "amount": "500.00" }
  ],
  "invoice_requested": true
}
```

## End-to-end examples

### Ad-hoc-only sale

```json
{
  "items": [
    {
      "name": "Servicio técnico",
      "description": "Ajuste manual",
      "unit_price": "500.00",
      "quantity": 1
    }
  ],
  "payment_methods": [
    { "method": "cash", "amount": "500.00" }
  ]
}
```

### Mixed catalog + ad-hoc sale

```json
{
  "items": [
    {
      "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "quantity": 1
    },
    {
      "name": "Alfajor suelto",
      "unit_price": "250.00",
      "quantity": 2
    }
  ],
  "payment_methods": [
    { "method": "cash", "amount": "621.00" }
  ]
}
```

### Mixed sale with ad-hoc split-ticket allocation

```json
{
  "items": [
    {
      "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "quantity": 1,
      "split_ticket": {
        "group_1_quantity": 1,
        "group_2_quantity": 0
      }
    },
    {
      "name": "Counter Service",
      "unit_price": "250.00",
      "quantity": 2,
      "split_ticket": {
        "group_1_quantity": 1,
        "group_2_quantity": 1
      }
    }
  ],
  "payment_methods": [
    { "method": "cash", "amount": "621.00" }
  ]
}
```

## Integration checklist

- [ ] Frontend distinguishes catalog-fixed, catalog-manual, and ad-hoc checkout rows.
- [ ] Ad-hoc requests send `name`, optional `description`, `unit_price`, and `quantity`.
- [ ] Ad-hoc requests do not send `product_id`, `iva`, or catalog-only `line_total`.
- [ ] Manual-price catalog products still use `product_id` and `line_total`, not the ad-hoc shape.
- [ ] Frontend validates `unit_price > 0` and integer `quantity >= 1` before submit.
- [ ] Frontend validates that payment allocations are non-empty and use unique methods.
- [ ] Frontend validates that payment allocation sums match the local checkout total, because the backend does not enforce it.
- [ ] Ad-hoc lines remain editable local draft state until `POST /sales`.
- [ ] Ad-hoc lines use a frontend-only local id before submit.
- [ ] If ad-hoc lines are split-ticketed, frontend prefers per-item `split_ticket`.
- [ ] Discount UI reads `discount_amount` and `applied_promotions` as source of truth.
- [ ] Frontend treats ad-hoc response `product_id` as opaque and never as a catalog lookup id.
- [ ] Invoice UI works for ad-hoc and mixed sales without asking for a custom IVA rate.

## Related docs

- [`frontend-integration.md`](./frontend-integration.md) — full backend/frontend contract.
- [`sales-and-reports-integration.md`](./sales-and-reports-integration.md) — payment allocations and reports.
- [`promotions-frontend-integration.md`](./promotions-frontend-integration.md) — automatic promotion behavior.
