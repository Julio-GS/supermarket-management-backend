# Sales Payment Allocations & Reports — Integration Guide

This guide covers the two API areas that consumers need to integrate after the sales–reports interaction improvements: the new payment method allocation format in Sales and the full Reports module.

It assumes you already have auth, product, and basic sale flows working. For the complete API reference (auth, products, basic sales, error shapes), see [`frontend-integration.md`](./frontend-integration.md).

## Quick path

1. Sales `payment_methods` are now objects with `method` and `amount` — not plain strings.
2. `POST /sales` accepts both catalog items and ad-hoc items; both still use the same payment allocation format.
3. Reports live at `GET /reports?window=day|week|month` and require the bearer token.
4. Run the Bruno requests to validate both modules end-to-end.

## 1. Sales: Payment Method Allocations

### What changed

The `payment_methods` field in sale requests and responses changed from a simple `string[]` to an array of allocation objects. Each allocation declares which payment method was used and how much money was paid through it.

### Request shape

```json
{
  "items": [
    { "product_id": "<uuid>", "quantity": 2 }
  ],
  "payment_methods": [
    { "method": "cash",   "amount": "4000.00" },
    { "method": "card",   "amount": "3501.50" }
  ]
}
```

### Response shape

```json
{
  "id": "b1eebc99-...",
  "total": "7501.50",
  "payment_methods": [
    { "method": "cash",   "amount": "4000.00" },
    { "method": "card",   "amount": "3501.50" }
  ],
  "items": [...],
  "invoice_status": "none",
  "...": "..."
}
```

### Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `method` | `"cash" \| "transfer" \| "card" \| "qr"` | yes | One of the four supported payment methods. |
| `amount` | string (money) | yes | Monetary string like `"4000.00"`. Up to two decimals. |

### Rules

- `payment_methods` must be non-empty.
- Each `method` must be unique within the array (you cannot use `cash` twice even with different amounts).
- Response order is normalized by the backend — do not rely on request order.
- The sum of all `amount` values across allocations is **not validated** against the sale total by the API. The backend stores what you send. Consumers should validate at the UI level if needed.

### TypeScript types

```typescript
type PaymentMethod = 'cash' | 'transfer' | 'card' | 'qr';

interface PaymentMethodAllocationRequest {
  method: PaymentMethod;
  amount: string;
}

interface PaymentMethodAllocationResponse {
  method: PaymentMethod;
  amount: string;
}

// In CreateSaleRequest:
interface CreateSaleRequest {
  items: SaleItemRequest[];
  payment_methods: PaymentMethodAllocationRequest[];
  split_ticket_groups?: SplitTicketGroupRequest[];
  invoice_requested?: boolean;
}

// In SaleResponse:
interface SaleResponse {
  // ...
  payment_methods: PaymentMethodAllocationResponse[];
  // ...
}
```

### Migration from the old format

If your frontend was sending `payment_methods: ["cash", "card"]`, update every call site:

```diff
- "payment_methods": ["cash"]
+ "payment_methods": [{ "method": "cash", "amount": "<calculated>" }]
```

The `amount` must be computed by the checkout UI based on how the cashier splits the total across payment methods. For simple single-method sales, `amount` equals the sale total.

### Sale item discount fields

Sale item responses now include promotion discount fields: `discount_amount`, `applied_promotions`, and legacy `applied_promotion_id` / `applied_promotion_type`. These are always present and do not require extra query parameters. For promotion stacking, store-wide promotions, and the full discount integration model, see [`promotions-frontend-integration.md`](./promotions-frontend-integration.md).

### Ad-hoc sale items with payment allocations

Ad-hoc sale items use the same `POST /sales` endpoint and the same `payment_methods` array. For the dedicated frontend guide, including union typing, response mapping, and split-ticket caveats for ad-hoc lines, see [`ad-hoc-sale-items-frontend-integration.md`](./ad-hoc-sale-items-frontend-integration.md).

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
  "payment_methods": [
    { "method": "cash", "amount": "399.98" }
  ]
}
```

Ad-hoc rules that matter to consumers:

- Required fields: `name`, `unit_price`, `quantity`. `description` is optional.
- The backend persists `iva: "21.00"` for ad-hoc items.
- The backend generates a synthetic `product_id` for the stored sale item. Treat it as opaque and never as a catalog lookup id.
- Ad-hoc items can receive store-wide promotions. Effective product-scoped promotions are excluded from the ad-hoc `applied_promotions` response.
- The API still does not validate that the sum of `payment_methods[].amount` matches the computed sale `total`.

### Split-ticket with payment allocations

Split-ticket sales use the same payment method allocation format. Each ticket group does NOT have its own payment method — there is one payment set for the whole sale:

```json
{
  "items": [
    { "product_id": "<uuid>", "quantity": 2 }
  ],
  "payment_methods": [
    { "method": "cash", "amount": "3750.75" },
    { "method": "card", "amount": "3750.75" }
  ],
  "split_ticket_groups": [
    { "label": "A", "items": [{ "product_id": "<uuid>", "quantity": 1 }] },
    { "label": "B", "items": [{ "product_id": "<uuid>", "quantity": 1 }] }
  ]
}
```

### ARCA invoicing with payment allocations

Invoice-requested sales use the same allocation format. Nothing changes for the invoice flow:

```json
{
  "invoice_requested": true,
  "payment_methods": [{ "method": "cash", "amount": "3750.75" }],
  "items": [{ "product_id": "<uuid>", "quantity": 1 }]
}
```

## 2. Reports Module

### Endpoint

```
GET /reports?window=day|week|month
```

Requires the bearer token. Returns aggregated business data for the selected time window. Windows use Argentina timezone (`America/Argentina/Buenos_Aires`).

### Query parameter

| Parameter | Type | Required | Values | Notes |
|-----------|------|----------|--------|-------|
| `window` | string | yes | `day`, `week`, `month` | `day` = today, `week` = Mon–Sun current week, `month` = current calendar month. |

### Response shape

```json
{
  "window": "day",
  "range": {
    "startsAt": "2026-07-05T00:00:00.000-03:00",
    "endsAt":   "2026-07-05T23:59:59.999-03:00"
  },
  "totalCollectedAmount": "7501.50",
  "paymentMethodBreakdown": [
    { "method": "cash", "amount": "4000.00" },
    { "method": "card", "amount": "3501.50" }
  ],
  "topProducts": [
    {
      "productId": "a0eebc99-...",
      "detalle": "Leche entera",
      "unitsSold": 12
    }
  ]
}
```

### Field reference

| Field | Type | Notes |
|-------|------|-------|
| `window` | `"day" \| "week" \| "month"` | Echoes the requested window. |
| `range.startsAt` | string (ISO 8601 with offset) | Start of the window in Argentina time. |
| `range.endsAt` | string (ISO 8601 with offset) | End of the window in Argentina time. |
| `totalCollectedAmount` | string (money) | Total collected across all payment methods in the window. |
| `paymentMethodBreakdown` | array | Break down of collected amounts by payment method, **sorted descending by amount**. |
| `paymentMethodBreakdown[].method` | `"cash" \| "transfer" \| "card" \| "qr"` | Payment method. |
| `paymentMethodBreakdown[].amount` | string (money) | Total collected via this method in the window. |
| `topProducts` | array | Top-selling products, **sorted descending by units sold**. Maximum 10 items. |
| `topProducts[].productId` | string (UUID) | Product identifier. |
| `topProducts[].detalle` | string | Product display name. |
| `topProducts[].unitsSold` | number | Total units sold in the window. |

### Window boundaries

| Window | startsAt | endsAt | Notes |
|--------|----------|--------|-------|
| `day` | Today 00:00:00 ART | Today 23:59:59 ART | Current Buenos Aires date. |
| `week` | Monday 00:00:00 ART | Sunday 23:59:59 ART | ISO week, Monday start. |
| `month` | 1st 00:00:00 ART | Last day 23:59:59 ART | Current calendar month. |

The `range` fields are always in Argentina time (`-03:00` offset). Use them as display labels — do not parse them as UTC.

### Caching behavior

Report responses are cached server-side with a short TTL. Repeated requests for the same window return cached data until the TTL expires or a new sale invalidates the cache. Frontend code does not need to send cache headers.

### Error cases

| Scenario | Status | Message |
|----------|--------|---------|
| Missing `window` query | 400 | validation error |
| Invalid `window` value | 400 | `Unsupported report window "<value>". Use day, week, or month.` |
| No bearer token | 401 | Unauthorized |

### TypeScript types

```typescript
type ReportWindow = 'day' | 'week' | 'month';

interface ReportQuery {
  window: ReportWindow;
}

interface ReportRange {
  startsAt: string; // ISO 8601 with Argentina offset
  endsAt: string;   // ISO 8601 with Argentina offset
}

interface PaymentMethodBreakdown {
  method: PaymentMethod;
  amount: string;
}

interface TopProduct {
  productId: string;
  detalle: string;
  unitsSold: number;
}

interface BusinessReport {
  window: ReportWindow;
  range: ReportRange;
  totalCollectedAmount: string;
  paymentMethodBreakdown: PaymentMethodBreakdown[];
  topProducts: TopProduct[];
}
```

### Fetch example

```typescript
async function getDayReport(token: string): Promise<BusinessReport> {
  const res = await fetch('http://localhost:3000/api/v1/reports?window=day', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}
```

## 3. Bruno Collection Updates

New requests added to `bruno/`:

| File | Seq | What it tests |
|------|-----|---------------|
| `Create Sale With Ad-Hoc Items.bru` | 10 | Mixed catalog + ad-hoc sale creation with persisted descriptive fields and fixed 21% IVA. |
| `Get Sale With Ad-Hoc Items.bru` | 11 | Ad-hoc sale read-back verification, including stored descriptive fields and store-only applied promotions. |
| `List Sales Paginated.bru` | 15 | Paginated sales endpoint with `{ data, meta }` structure and payment method allocation shape in response items. |
| `Get Business Report - Day.bru` | 16 | Day window report: fields, range timezone, payment method amounts, top products. |
| `Get Business Report - Week.bru` | 17 | Week window report: fields, range boundaries, top products limit (≤10). |
| `Get Business Report - Month.bru` | 18 | Month window report: fields, payment breakdown sort order verification. |

Run them with the CLI:

```bash
cd bruno
bru run --env Local
```

Or individually:

```bash
bru run "Get Business Report - Day.bru" --env Local
```

The existing sales Bruno requests (`Create Sale.bru`, `Create Sale With Split Ticket.bru`, `Create Sale With ARCA Invoice.bru`, `List Sales.bru`, `Get Sale.bru`) already use the new `{method, amount}` payment format. The ad-hoc sale requests extend that same pattern to mixed and non-catalog checkout flows.

## Checklist

### Sales payment allocations

- [ ] Checkout UI collects a payment method breakdown from the cashier (method + amount).
- [ ] Every `POST /sales` call sends `payment_methods` as `PaymentMethodAllocation[]`.
- [ ] Frontend supports both catalog sale items and ad-hoc sale items in the same checkout request.
- [ ] Frontend treats ad-hoc response `product_id` values as opaque identifiers, not product catalog ids.
- [ ] Frontend displays `payment_methods` from sale responses as `method: $amount`.
- [ ] Split-ticket checkout sends one `payment_methods` array for the whole sale, not per group.
- [ ] Legacy `string[]` format is fully removed from all frontend call sites.

### Reports

- [ ] Reports screen calls `GET /reports?window=<window>` on mount.
- [ ] Window selector (day/week/month) updates the `window` query parameter.
- [ ] `totalCollectedAmount` is displayed prominently at the top.
- [ ] `paymentMethodBreakdown` is rendered as a list or chart, sorted by amount descending.
- [ ] `topProducts` (up to 10 items) is rendered in a table with product name, units sold.
- [ ] `range.startsAt` and `range.endsAt` are displayed as the report period label.
- [ ] 400 is handled for unsupported window values (show a message, fall back to `day`).
- [ ] Reports are re-fetched when the window selector changes.

### Verification

- [ ] `bruno\List Sales Paginated.bru` passes against the local backend.
- [ ] `bruno\sales\Create Sale With Ad-Hoc Items.bru` passes against the local backend.
- [ ] `bruno\sales\Get Sale With Ad-Hoc Items.bru` passes against the local backend.
- [ ] `bruno\Get Business Report - Day.bru` passes against the local backend.
- [ ] `bruno\Get Business Report - Week.bru` passes against the local backend.
- [ ] `bruno\Get Business Report - Month.bru` passes against the local backend.

## Next step

Point the frontend at the local backend, run the updated Bruno collection to verify all sales payment allocation and reports flows, then build the checkout payment splitter UI and the reports dashboard screen.
