# Supermarket MVP API — Bruno Collection

This collection covers the main MVP flow of the NestJS backend:
authentication, product CRUD, barcode conflict handling, and sales with payment methods, split tickets, and ARCA invoicing.

## Requirements

- [Bruno](https://www.usebruno.com/) desktop app **or** the Bruno CLI.
- Backend running locally, e.g. `npm run start:dev`.
- Default environment assumes `http://localhost:3000/api/v1`.

## Collection structure

```text
bruno/
├── bruno.json
├── environments/Local.bru
├── Register.bru
├── Login.bru
├── Create Product.bru
├── List Products.bru
├── Get Product.bru
├── Update Product.bru
├── Duplicate Barcode Conflict.bru
├── Create Sale.bru
├── List Sales.bru
├── Get Sale.bru
├── Create Sale With Split Ticket.bru
├── Get Sale With Split Ticket.bru
├── Create Sale With ARCA Invoice.bru
├── Protected Without Token.bru
├── List Sales Paginated.bru
├── Get Business Report - Day.bru
├── Get Business Report - Week.bru
├── Get Business Report - Month.bru
├── Create Promotion.bru
├── List Promotions.bru
├── Update Promotion.bru
├── Disable Promotion.bru
├── Create Sale With Promotion.bru
└── Get Sale With Promotion.bru
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

Run a single request:

```bash
cd bruno
bru run "Create Product.bru" --env Local
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

Collection variables (`username`, `password`, `token`, `productId`, `saleId`, `splitTicketSaleId`, `promotionId`, `promoSaleId`, `cae`, `cbteNro`, barcodes) are generated and extracted at runtime by pre-request and post-response scripts.

## Covered flows

1. **Register** — creates a unique user and returns an `access_token`.
2. **Login** — authenticates the same user and captures the token.
3. **Create Product** — creates a product with two unique barcodes; stores the product id.
4. **List Products** — lists all products.
5. **Get Product** — fetches the created product by id.
6. **Update Product** — updates the product name.
7. **Duplicate Barcode Conflict** — tries to reuse an existing barcode and expects `409`.
8. **Create Sale** — creates a non-fiscal sale with payment methods.
9. **List Sales** — lists all sales for the authenticated user and returns the current sale fields.
10. **Get Sale** — fetches the created sale by id and returns the current sale fields.
11. **Create Sale With Split Ticket** — creates a sale with two split-ticket groups and stores `splitTicketSaleId`.
12. **Get Sale With Split Ticket** — fetches the split-ticket sale by id and verifies the persisted allocation.
13. **Create Sale With ARCA Invoice** — creates a fiscal sale and returns ARCA invoice data.
14. **Protected Without Token** — calls a protected route with no token and expects `401`.
15. **List Sales Paginated** — lists sales with pagination query and verifies the `{ data, meta }` response and payment method allocations.
16. **Get Business Report - Day** — fetches today's business report with payment method breakdown and top products.
17. **Get Business Report - Week** — fetches the current week's business report.
18. **Get Business Report - Month** — fetches the current month's business report with descending payment method sort verification.

## Promotions flow (manual)

The following requests cover end-to-end promotions testing. Run them in order after Login and Create Product have set the `token` and `productId` variables.

19. **Create Promotion** — creates a `percentage` promotion (15 % off) active on today's weekday for the current product; stores `promotionId`.
20. **List Promotions** — lists all promotions and verifies the array structure.
21. **Update Promotion** — changes the discount to 25 % and verifies the update.
22. **Disable Promotion** — soft-deletes the promotion (sets `enabled: false`); expects `204`.
23. **Create Sale With Promotion** — creates a 3-unit sale for the promoted product; stores `promoSaleId`. Verifies each item includes `discount_amount`, `applied_promotion_id`, and `applied_promotion_type`.
24. **Get Sale With Promotion** — fetches the sale by id and confirms the discount fields match the applied promotion.

### How to test promotions manually

1. **Run `Login`** (or `Register` → `Login`) to obtain a `token`.
2. **Run `Create Product`** — a product id is stored in `productId`.
3. **Run `Create Promotion`** — a `percentage` promotion is created on that product, active on today's weekday. The `promotionId` is captured.
4. **Run `Get Product`** — verify the response includes a `promotions` array with the newly created promotion summary (`id`, `type`, `discount_percent`, `weekdays`).
5. **Run `Create Sale With Promotion`** — creates a sale using the promoted product. Verify each line item includes non-null `discount_amount`, `applied_promotion_id`, and `applied_promotion_type`. The `total` should be less than the undiscounted subtotal.
6. **Run `Get Sale With Promotion`** — confirm the discount fields are persisted on the sale read.
7. **(Optional) Run `Update Promotion`** then **`List Promotions`** to confirm the discount change is visible.
8. **(Optional) Run `Disable Promotion`** then **`List Promotions`** — the promotion still appears but `enabled` is now `false`. Run `Get Product` to confirm the promotions summary no longer includes it.

> **Caveat**: The existing `Create Sale` (flow #8) expects a hardcoded total of `7501.50`. If a promotion is active on that product when it runs, the discounted total will differ and the test will fail. For end-to-end promotions testing, run the promotions flow separately from the main collection run, or disable the promotion before re-running `Create Sale`.

> No `DATABASE_URL` or other secrets are stored in these files.
