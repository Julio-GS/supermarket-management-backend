# Provider Purchases - Frontend Integration Guide

This guide covers the provider purchase feature exposed under the `reports` module. It is intended for frontend developers building a purchase history screen, create/edit form, delete action, and a small reporting view for provider expenses.

It assumes auth is already working. For the shared API conventions and error shape, see [`frontend-integration.md`](./frontend-integration.md). For the main sales/business reports module, see [`sales-and-reports-integration.md`](./sales-and-reports-integration.md).

## Quick path

1. Use `POST /reports/provider-purchases` to create a provider purchase.
2. Use `GET /reports/provider-purchases` to render the history list.
3. Use `PUT /reports/provider-purchases/:id` for inline edit or modal edit.
4. Use `DELETE /reports/provider-purchases/:id` for removal and handle `204 No Content`.
5. Use `GET /reports/provider-purchases/report?window=day|week|month` for expense summary cards and charts.

## What this feature is for

Provider purchases are outgoing expense records such as inventory buys, restocking, or supplier payments. They are separate from sales and are currently exposed from the `reports` module because the reporting endpoint aggregates provider purchase totals by time window.

All routes below require the bearer token:

```http
Authorization: Bearer <access_token>
```

## Endpoints

Base route: `/reports`

| Method | Path | What it does |
|--------|------|--------------|
| `POST` | `/reports/provider-purchases` | Create one provider purchase record. |
| `GET` | `/reports/provider-purchases` | List all provider purchases. |
| `PUT` | `/reports/provider-purchases/:id` | Update any subset of fields. |
| `DELETE` | `/reports/provider-purchases/:id` | Delete one provider purchase. Returns no body. |
| `GET` | `/reports/provider-purchases/report?window=day|week|month` | Aggregate provider purchase totals for the selected window. |

## Data model

### Create request

```json
{
  "provider_name": "Distribuidora Centro",
  "amount": "1450.75",
  "payment_method": "transfer"
}
```

### Update request

Fully partial. Send only the fields you want to change.

```json
{
  "provider_name": "Distribuidora Centro SRL",
  "amount": "1650.25",
  "payment_method": null
}
```

### List, create, and update response

```json
{
  "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "provider_name": "Distribuidora Centro",
  "amount": "1450.75",
  "payment_method": "transfer",
  "created_at": "2026-07-14T15:20:00.000Z",
  "updated_at": "2026-07-14T15:20:00.000Z"
}
```

### Report response

```json
{
  "window": "day",
  "range": {
    "startsAt": "2026-07-14T00:00:00.000-03:00",
    "endsAt": "2026-07-14T23:59:59.999-03:00"
  },
  "totalAmount": "1650.25",
  "purchaseCount": 1,
  "paymentMethodBreakdown": [
    {
      "method": "transfer",
      "amount": "1650.25"
    }
  ]
}
```

## Field reference

### Create and update payload

| Field | Create | Update | Type | Notes |
|-------|--------|--------|------|-------|
| `provider_name` | required | optional | string | Required business label for the supplier/provider. Max 255 chars. Backend trims it before storing. |
| `amount` | required | optional | string (money) | Must be numeric. Create also requires it to be greater than `0`. |
| `payment_method` | optional | optional | string or `null` | Max 50 chars. Use `null` on update to clear it. |

### Item response

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (UUID) | Record identifier. |
| `provider_name` | string | Provider label persisted by the backend. |
| `amount` | string (money) | Returned as a string. Keep it as money text in the frontend model. |
| `payment_method` | string or `null` | Can be `null` when omitted on create or explicitly cleared on update. |
| `created_at` | string (ISO 8601) | Creation timestamp. |
| `updated_at` | string (ISO 8601) | Last update timestamp. |

### Report response

| Field | Type | Notes |
|-------|------|-------|
| `window` | `"day" \| "week" \| "month"` | Echoes the selected window. |
| `range.startsAt` | string (ISO 8601 with `-03:00`) | Start of the reporting window in Argentina time. |
| `range.endsAt` | string (ISO 8601 with `-03:00`) | End of the reporting window in Argentina time. |
| `totalAmount` | string (money) | Sum of all provider purchase amounts in the window. |
| `purchaseCount` | number | Number of provider purchase rows in the window. |
| `paymentMethodBreakdown` | array | Sum by payment method, sorted descending by amount. |
| `paymentMethodBreakdown[].method` | string | Payment method label. `null` purchases are grouped as `"unknown"` in the report. |
| `paymentMethodBreakdown[].amount` | string (money) | Aggregated amount for that method. |

## List behavior

`GET /reports/provider-purchases` returns a plain array, not a paginated wrapper.

The backend currently sorts the list by `created_at DESC`, so the newest purchase appears first.

```json
[
  {
    "id": "b1eebc99-...",
    "provider_name": "Distribuidora Centro",
    "amount": "1650.25",
    "payment_method": null,
    "created_at": "2026-07-14T15:20:00.000Z",
    "updated_at": "2026-07-14T15:30:00.000Z"
  }
]
```

There are currently no query parameters for search, pagination, or sorting.

## Validation rules

These are the rules the frontend should respect before calling the API.

| Rule | Behavior |
|------|----------|
| `provider_name` is required on create | Reject empty values in the form. The backend trims whitespace and rejects blank values. |
| `provider_name` max length is 255 | Prevent overlong text entry. |
| `amount` is required on create | Do not submit without it. |
| `amount` must be numeric | Use a money input or strict text validation. |
| `amount` must be positive on create | The backend rejects `0` and negative numbers on create. |
| `payment_method` max length is 50 | Keep free-text or select options within that limit. |
| `:id` must be a valid UUID | Invalid ids fail before the use case runs. |
| `window` must be `day`, `week`, or `month` | Other values return `400`. |

### Important update caveat

The update endpoint is partial, but it does **not** re-check that `amount > 0` in the application layer. Frontend code SHOULD still enforce positive amounts on edit so bad values are never sent from the UI.

### Important payment method caveat

Use `null` to clear `payment_method`.

Do **not** send an empty string to mean "no payment method". The backend clearly normalizes `null`, but an empty string is not normalized the same way during update and can produce confusing report breakdown output.

## Error expectations

The API uses the shared error shape documented in [`frontend-integration.md`](./frontend-integration.md#error-response-shape).

Typical cases for this feature:

| Scenario | Status | Expected message |
|----------|--------|------------------|
| Missing/expired token | `401` | Unauthorized |
| Missing `provider_name` | `400` | Validation error or `provider_name is required` |
| Missing/invalid `amount` | `400` | Validation error or `amount must be a positive number` |
| Invalid UUID in `:id` | `400` | Validation error |
| Invalid `window` | `400` | `Unsupported report window "<value>". Use day, week, or month.` |
| Update target not found | `404` | `Provider purchase not found` |
| Delete target not found | `404` | `Provider purchase not found` |

### Delete response

`DELETE /reports/provider-purchases/:id` returns `204 No Content`.

That means:

- no JSON body
- no response payload to parse
- frontend should just remove the row locally or re-fetch the list

## Suggested UI flow

### 1. Provider purchase list screen

Recommended columns:

- provider name
- amount
- payment method
- created at
- updated at
- actions: edit, delete

Recommended behavior:

- fetch `GET /reports/provider-purchases` on screen load
- keep newest entries at the top
- render `payment_method ?? "Unspecified"`
- confirm before delete

### 2. Create form

Recommended fields:

- `provider_name`: text input
- `amount`: money input
- `payment_method`: optional select or optional text input

Recommended validation:

- trim `provider_name`
- require a non-empty provider name
- require amount
- enforce positive amount
- if `payment_method` is optional, submit `undefined` or omit the field when blank

### 3. Edit flow

Use `PUT /reports/provider-purchases/:id` with only changed fields.

Recommended UX:

- prefill the current values
- allow clearing `payment_method`
- when clearing it, send `null`
- keep the same local row id and replace the rest with the response

### 4. Delete flow

Recommended UX:

- show a confirmation dialog
- call `DELETE /reports/provider-purchases/:id`
- on `204`, remove the row from local state immediately
- on failure, keep the row and show a toast or inline error

### 5. Reporting widget or screen

Use `GET /reports/provider-purchases/report?window=day|week|month` for summary cards and charts.

Suggested UI pieces:

- summary card: `totalAmount`
- summary card: `purchaseCount`
- pie/bar chart: `paymentMethodBreakdown`
- caption/subtitle: `range.startsAt` to `range.endsAt`
- selector/tabs: `day`, `week`, `month`

## Time window behavior

The report uses the same window rules as the business reports module and returns boundaries in `America/Argentina/Buenos_Aires` time.

| Window | Meaning |
|--------|---------|
| `day` | Current Buenos Aires day, `00:00:00` to `23:59:59.999` |
| `week` | Current Monday to Sunday window |
| `month` | Current calendar month |

Use the returned `range` values as the display label for the UI. Do not rebuild the label client-side unless you must.

## Practical implementation notes

- Treat `amount` and `totalAmount` as money strings, not floating-point numbers in your app state.
- If you need numeric math in the UI, parse only at the edge and reformat carefully.
- `payment_method` is free-form text today. If you want consistency in the UI, prefer a controlled select with app-owned options.
- The list endpoint returns all rows. If the dataset grows, the frontend may eventually need pagination, but it is not available yet.
- Report responses are cacheable server-side. Frontend code does not need to send cache headers.
- Create, update, and delete operations invalidate the report cache on the backend, so a re-fetch after a mutation is safe.
- If a purchase has `payment_method: null`, the item response stays `null`, but the report groups it under `"unknown"`.

## TypeScript interfaces

```typescript
type ProviderPurchaseReportWindow = 'day' | 'week' | 'month';

interface CreateProviderPurchaseRequest {
  provider_name: string;
  amount: string;
  payment_method?: string;
}

interface UpdateProviderPurchaseRequest {
  provider_name?: string;
  amount?: string;
  payment_method?: string | null;
}

interface ProviderPurchaseResponse {
  id: string;
  provider_name: string;
  amount: string;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
}

interface ProviderPurchaseReportRange {
  startsAt: string;
  endsAt: string;
}

interface ProviderPurchasePaymentMethodBreakdown {
  method: string;
  amount: string;
}

interface ProviderPurchaseReportResponse {
  window: ProviderPurchaseReportWindow;
  range: ProviderPurchaseReportRange;
  totalAmount: string;
  purchaseCount: number;
  paymentMethodBreakdown: ProviderPurchasePaymentMethodBreakdown[];
}
```

## Fetch examples

```typescript
const API = 'http://localhost:3000/api/v1';

async function listProviderPurchases(token: string): Promise<ProviderPurchaseResponse[]> {
  const res = await fetch(`${API}/reports/provider-purchases`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}

async function createProviderPurchase(
  token: string,
  request: CreateProviderPurchaseRequest,
): Promise<ProviderPurchaseResponse> {
  const res = await fetch(`${API}/reports/provider-purchases`, {
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

async function updateProviderPurchase(
  token: string,
  id: string,
  request: UpdateProviderPurchaseRequest,
): Promise<ProviderPurchaseResponse> {
  const res = await fetch(`${API}/reports/provider-purchases/${id}`, {
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

async function deleteProviderPurchase(token: string, id: string): Promise<void> {
  const res = await fetch(`${API}/reports/provider-purchases/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message);
  }
}

async function getProviderPurchaseReport(
  token: string,
  window: ProviderPurchaseReportWindow,
): Promise<ProviderPurchaseReportResponse> {
  const res = await fetch(`${API}/reports/provider-purchases/report?window=${window}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}
```

## Bruno coverage

The Bruno collection now includes these requests under `bruno/reports/`:

| File | What it tests |
|------|---------------|
| `Create Provider Purchase.bru` | Create request shape, response shape, variable capture. |
| `List Provider Purchases.bru` | Array shape, created item presence, descending creation order. |
| `Update Provider Purchase.bru` | Partial update, `payment_method: null`, persisted id. |
| `Get Provider Purchases Report - Day.bru` | Day-window report response shape, totals, purchase count, `unknown` payment bucket after clearing method. |
| `Get Provider Purchases Report - Week.bru` | Week-window report response shape and timezone range. |
| `Get Provider Purchases Report - Month.bru` | Month-window report response shape and descending breakdown sort. |
| `Delete Provider Purchase.bru` | `204 No Content` delete path. |

## Checklist

- [ ] Frontend sends the bearer token on every provider purchase request.
- [ ] Create form trims and validates `provider_name`.
- [ ] Create and edit forms enforce positive amounts.
- [ ] UI treats `amount` values as money strings.
- [ ] Edit flow uses partial `PUT` payloads.
- [ ] Clearing `payment_method` sends `null`, not an empty string.
- [ ] Delete flow handles `204` without trying to parse JSON.
- [ ] Report screen uses `window=day|week|month` exactly.
- [ ] Report UI labels use the returned Argentina-time `range`.
- [ ] Bruno requests pass locally before frontend rollout.

## Next step

Build the provider purchase list and form first, then add the day/week/month reporting view on top of the same module and validate the full flow with the Bruno requests.
