# Supermarket MVP API — Bruno Collection

This collection covers the main MVP flow of the NestJS backend:
authentication, product CRUD, barcode conflict handling, sales with payment methods, split tickets, ARCA invoicing, promotions (product-specific and store-wide), and provider purchase reporting.

## Requirements

- [Bruno](https://www.usebruno.com/) desktop app **or** the Bruno CLI.
- Backend running locally, e.g. `npm run start:dev`.
- Default environment assumes `http://localhost:3000/api/v1`.

## Collection structure

```text
bruno/
├── bruno.json
├── collection.bru
├── README.md
├── environments/Local.bru
├── auth/
│   ├── Register.bru
│   └── Login.bru
├── products/
│   ├── Create Product.bru
│   ├── List Products.bru
│   ├── Get Product.bru
│   ├── Update Product.bru
│   └── Duplicate Barcode Conflict.bru
├── sales/
│   ├── Create Sale.bru
│   ├── List Sales.bru
│   ├── List Sales Paginated.bru
│   ├── Get Sale.bru
│   ├── Create Sale With Split Ticket.bru
│   ├── Get Sale With Split Ticket.bru
│   ├── Create Sale With ARCA Invoice.bru
│   ├── Create Sale With Promotion.bru
│   ├── Get Sale With Promotion.bru
│   ├── Create Sale With Ad-Hoc Items.bru
│   └── Get Sale With Ad-Hoc Items.bru
├── promotions/
│   ├── Create Promotion.bru
│   ├── Create Store Promotion.bru
│   ├── List Promotions.bru
│   ├── Update Promotion.bru
│   └── Disable Promotion.bru
├── reports/
│   ├── Get Business Report - Day.bru
│   ├── Get Business Report - Week.bru
│   ├── Get Business Report - Month.bru
│   ├── Create Provider Purchase.bru
│   ├── List Provider Purchases.bru
│   ├── Update Provider Purchase.bru
│   ├── Get Provider Purchases Report - Day.bru
│   ├── Get Provider Purchases Report - Week.bru
│   ├── Get Provider Purchases Report - Month.bru
│   └── Delete Provider Purchase.bru
└── misc/
    ├── Protected Without Token.bru
    └── prueba.bru
```

## Running with the Bruno CLI

Install the CLI (if not already installed):

```bash
npm install -g @usebruno/cli
```

Run the whole collection using the `Local` environment:

```bash
cd bruno
bru run --env Local
```

Run a single request inside a folder:

```bash
cd bruno
bru run "products/Create Product.bru" --env Local
```

Run an entire folder:

```bash
cd bruno
bru run "auth" --env Local
bru run "promotions" --env Local
```

## Running with the Bruno desktop app

1. Open Bruno.
2. Choose **Open Collection**.
3. Select the `bruno/` folder in this repository.
4. Select the `Local` environment from the environment dropdown.
5. Run requests individually or use **Run Collection**.

## Environment variables

| Variable | Default                         | Description                              |
|----------|---------------------------------|------------------------------------------|
| `baseUrl`| `http://localhost:3000/api/v1`  | Base URL for all requests.               |

Collection variables (`username`, `password`, `token`, `productId`, `saleId`, `splitTicketSaleId`, `promotionId`, `storePromotionId`, `promoSaleId`, `adHocSaleId`, `providerPurchaseId`, `cae`, `cbteNro`, barcodes) are generated and extracted at runtime by pre-request and post-response scripts.

## Covered flows

### Auth
1. **Register** — creates a unique user and returns an `access_token`.
2. **Login** — authenticates the same user and captures the token.

### Products
3. **Create Product** — creates a product with two unique barcodes; stores the product id.
4. **List Products** — lists all products.
5. **Get Product** — fetches the created product by id. Optionally verifies the `promotions` summary array when promotions are active.
6. **Update Product** — updates the product name.
7. **Duplicate Barcode Conflict** — tries to reuse an existing barcode and expects `409`.

### Sales
8. **Create Sale** — creates a non-fiscal sale with payment method allocation objects (`{ method, amount }`).
9. **List Sales** — lists all sales for the authenticated user and returns the current sale fields.
10. **List Sales Paginated** — lists sales with pagination query and verifies the `{ data, meta }` response and payment method allocation shape.
11. **Get Sale** — fetches the created sale by id and returns the current sale fields.
12. **Create Sale With Split Ticket** — creates a sale with two split-ticket groups and stores `splitTicketSaleId`.
13. **Get Sale With Split Ticket** — fetches the split-ticket sale by id and verifies the persisted allocation.
14. **Create Sale With ARCA Invoice** — creates a fiscal sale and returns ARCA invoice data.
15. **Create Sale With Promotion** — creates a 3-unit sale for the promoted product; stores `promoSaleId`. Verifies each item includes `discount_amount`, `applied_promotion_id`, `applied_promotion_type`, and the stacked `applied_promotions` array with `{ promotion_id, promotion_scope, promotion_type, discount_amount }` entries.
16. **Get Sale With Promotion** — fetches the sale by id and confirms discount fields and `applied_promotions` are persisted on the sale read.
17. **Create Sale With Ad-Hoc Items** — creates a mixed sale with one catalog item plus one ad-hoc item (`name`, optional `description`, `unit_price`, `quantity`); stores `adHocSaleId`. Verifies the ad-hoc response item includes fixed `iva: "21.00"`, a synthetic `product_id`, and only store-scoped entries in `applied_promotions`.
18. **Get Sale With Ad-Hoc Items** — fetches the ad-hoc sale by id and confirms the descriptive fields and applied promotions are persisted on the sale read.

### Promotions
17. **Create Promotion** — creates a `percentage` promotion (15 %) with `name`, `description`, `scope: "product"`, and `product_id`; stores `promotionId`.
18. **Create Store Promotion** — creates a store-wide `percentage` promotion (10 %) with `scope: "store"` (no `product_id`); stores `storePromotionId`.
19. **List Promotions** — lists all promotions and verifies the array structure includes `name`, `scope`, `type`, `product_id`, and `enabled`.
20. **Update Promotion** — changes the name, description, and discount to 25 %; verifies the update.
21. **Disable Promotion** — soft-deletes the promotion (sets `enabled: false`); expects `204`.

### Reports
22. **Get Business Report - Day** — fetches today's business report with payment method breakdown and top products.
23. **Get Business Report - Week** — fetches the current week's business report.
24. **Get Business Report - Month** — fetches the current month's business report with descending payment method sort verification.
25. **Create Provider Purchase** — creates a provider purchase under `/reports/provider-purchases`; stores `providerPurchaseId`.
26. **List Provider Purchases** — lists all provider purchases and verifies the created row is present.
27. **Update Provider Purchase** — edits the created provider purchase and clears `payment_method` with `null`.
28. **Get Provider Purchases Report - Day** — fetches today's provider purchase report and verifies aggregate fields plus the `unknown` bucket for cleared payment methods.
29. **Get Provider Purchases Report - Week** — fetches the current week's provider purchase report.
30. **Get Provider Purchases Report - Month** — fetches the current month's provider purchase report with descending payment method sort verification.
31. **Delete Provider Purchase** — deletes the created provider purchase and expects `204`.

### Misc
32. **Protected Without Token** — calls a protected route with no token and expects `401`.

## Promotions flow (manual)

The following requests cover end-to-end promotions testing. Run them in order after Login and Create Product have set the `token` and `productId` variables.

### Product-specific promotion

1. **Run `Create Promotion`** — creates a `percentage` promotion (15 %) scoped to `product` with the current `productId`. The `promotionId` is captured.
2. **Run `Get Product`** — verify the response includes a `promotions` array with the newly created promotion summary (`id`, `type`, `discount_percent`, `weekdays`).
3. **Run `Create Sale With Promotion`** — creates a 3-unit sale using the promoted product. Verify each line item includes:
   - `discount_amount`, `applied_promotion_id`, `applied_promotion_type` (legacy fields)
   - `applied_promotions` array with entries containing `promotion_id`, `promotion_scope`, `promotion_type`, `discount_amount`
   - The `total` should be less than the undiscounted subtotal.
4. **Run `Get Sale With Promotion`** — confirm the discount fields and `applied_promotions` array are persisted on the sale read.

### Store-wide promotion

5. **Run `Create Store Promotion`** — creates a `percentage` promotion (10 %) with `scope: "store"` (no `product_id`). Captures `storePromotionId`.
6. **Run `Create Sale`** (or any sale) — if the store-wide promotion is active, sale items should include it in their `applied_promotions` array alongside any product-specific promotion.

### Update and disable

7. **(Optional) Run `Update Promotion`** — changes the promotion name, description, and discount to 25 %. Verify the response reflects the new values.
8. **(Optional) Run `List Promotions`** — confirm the updated promotion is visible with the new `name`, `scope`, and `discount_percent`.
9. **(Optional) Run `Disable Promotion`** then **`List Promotions`** — the promotion still appears but `enabled` is now `false`. Run `Get Product` to confirm the promotions summary no longer includes it.

> **Caveat**: The existing `Create Sale` (flow #8) expects a hardcoded total of `7501.50`. If a promotion is active on that product when it runs, the discounted total will differ and the test will fail. For end-to-end promotions testing, run the promotions flow separately from the main collection run, or disable the promotion before re-running `Create Sale`.

## Ad-hoc sale items flow (manual)

Run these after `Login` and `Create Product` have populated `token` and `productId`:

1. **Run `Create Sale With Ad-Hoc Items`** — creates a mixed sale with one catalog item plus one ad-hoc item. Verify the ad-hoc item returns `name`, `description`, fixed `iva: "21.00"`, and a generated `product_id`.
2. **Run `Get Sale With Ad-Hoc Items`** — confirms the same descriptive fields are persisted on reads.

Notes:

- The ad-hoc item `product_id` is a synthetic backend value for sale persistence. Treat it as opaque and do not use it as a catalog lookup key.
- Ad-hoc items can receive store-wide promotions, but effective product-scoped promotions are filtered out of `applied_promotions`.
- The request intentionally uses a dummy payment allocation amount because the API does not validate `payment_methods[].amount` against the computed total.

## Provider purchases flow

Run these in order after `Login` has populated `token`:

1. **Run `Create Provider Purchase`** — creates a provider purchase and stores `providerPurchaseId`.
2. **Run `List Provider Purchases`** — confirms the created row is present and the list remains newest-first.
3. **Run `Update Provider Purchase`** — updates the amount and clears `payment_method` with `null`.
4. **Run `Get Provider Purchases Report - Day`** — validates aggregate totals, purchase count, timezone range, and confirms cleared methods appear under `unknown`.
5. **Run `Get Provider Purchases Report - Week`** and **`Get Provider Purchases Report - Month`** — validates the other supported report windows.
6. **Run `Delete Provider Purchase`** — removes the created row and expects `204`.

> No `DATABASE_URL` or other secrets are stored in these files.
