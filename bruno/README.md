# Supermarket MVP API — Bruno Collection

This collection covers the main MVP flow of the NestJS backend:
authentication, product CRUD, barcode conflict handling, and sales.

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

Collection variables (`username`, `password`, `token`, `productId`, `saleId`, barcodes) are generated and extracted at runtime by pre-request and post-response scripts.

## Covered flows

1. **Register** — creates a unique user and returns an `access_token`.
2. **Login** — authenticates the same user and captures the token.
3. **Create Product** — creates a product with two unique barcodes; stores the product id.
4. **List Products** — lists all products.
5. **Get Product** — fetches the created product by id.
6. **Update Product** — updates the product name.
7. **Duplicate Barcode Conflict** — tries to reuse an existing barcode and expects `409`.
8. **Create Sale** — creates a sale for the product with quantity `3`.
9. **List Sales** — lists all sales for the authenticated user.
10. **Get Sale** — fetches the created sale by id.
11. **Protected Without Token** — calls a protected route with no token and expects `401`.

> No `DATABASE_URL` or other secrets are stored in these files.
