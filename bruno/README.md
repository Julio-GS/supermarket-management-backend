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
└── Protected Without Token.bru
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

Collection variables (`username`, `password`, `token`, `productId`, `saleId`, `splitTicketSaleId`, `cae`, `cbteNro`, barcodes) are generated and extracted at runtime by pre-request and post-response scripts.

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

> No `DATABASE_URL` or other secrets are stored in these files.
