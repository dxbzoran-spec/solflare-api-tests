# Solflare Wallet API tests

Automated API tests for the Solflare wallet API (`https://wallet-api.solflare.com`), written in
**TypeScript** with the **[Playwright request API](https://playwright.dev/docs/api-testing)** as the test runner.
No browsers are used.

Endpoints under test:

| Endpoint | Purpose |
| --- | --- |
| `GET /v3/portfolio/tokens/{address}?network=` | Token portfolio of a single address |
| `POST /v2/portfolio/balances` | Net worth of a list of addresses |

Addresses under test: `96Y3j66AX16noUAAVriW8bmwTGzV1PVqBKCEArPd5fuU`, `7eXxD3vQww9cgBgD3gb7iqTriAzAmCBXFBMpdDi71P3i`.

## Quick start

Requirements: **Node.js 20+** (22 recommended, see `.nvmrc`) and npm.

```bash
npm ci                    # install dependencies
npm test                  # run the whole suite
npm run report            # open the HTML report of the last run
```

Other useful commands:

```bash
npm run test:scenario1    # only Test Scenario 1 (total portfolio value)
npm run test:scenario2    # only Test Scenario 2 (balances / net worth)
npm run typecheck         # TypeScript type check
npx playwright test tests/balances.spec.ts   # a single spec file
```

### Configuration

All settings have sensible defaults and can be overridden with environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `BASE_URL` | `https://wallet-api.solflare.com` | API under test |
| `CROSS_REQUEST_TOLERANCE` | `0.01` | Max allowed USD difference between values taken from **different** requests (live prices) |
| `RATE_LIMIT_RETRIES` | `3` | Retries after an HTTP 429 response |

## Test cases

### Test Scenario 1: total portfolio value (`tests/tokens.spec.ts`)

One test covers both addresses (one `test.step` per address, with soft assertions so a failure on the first
address does not hide the second). For each address on `mainnet`:

1. `value.total` == Σ (`price.price` × `totalUiAmount`) over all tokens (tokens without a price count as 0)
2. `value.total` == `tokensValue.total` + `stocksValue.total`

### Test Scenario 2: balances / net worth (`tests/balances.spec.ts`)

Request with both addresses (prefixed with `1`), `currency: usd`, `general: true`, `network: mainnet`.

- **2a:** `netWorth` == sum of the `value.total` of both addresses from the tokens endpoint (Scenario 1)
- **2b:** `netWorth` == Σ `data[].value` (balances endpoint only), and every requested address is present

### Additional coverage

| Area | Test |
| --- | --- |
| Tokens | `stocksValue` / `tokensValue` equal the sums of stock / non-stock tokens |
| Tokens | Response contract (zod schema), non-negative amounts, positive USD prices, empty `errors` |
| Tokens | `devnet` and `testnet` return valid, self-consistent responses |
| Tokens | Omitting `network` defaults to `mainnet` |
| Balances | Each wallet value equals that address's tokens portfolio total |
| Balances | Single address, duplicate addresses (counted once), empty list (net worth 0) |
| Balances | Every supported currency (`eur`, `gbp`, `jpy`, `chf`, `aud`, `cad`, `inr`) returns a consistent net worth |
| Balances | `devnet` and `testnet` return every wallet and a consistent net worth |
| Negative | Unsupported network → 400 (both endpoints) |
| Negative | Invalid public key → 400 (tokens), non-base58 key → 400 (balances) |
| Negative | Missing `1` prefix → 400, unsupported currency → 422, missing `pubkeys` → 400 |
| Negative | Missing `Authorization` header → 403, malformed Bearer token → 403 |

## Design decisions

- **Independent tests.** Scenario 2a needs Scenario 1's totals; instead of sharing state between tests it
  fetches them itself. Every test gets its own client with a fresh uuid4 (a simulated "app install",
  sent as `Authorization: Bearer {uuid4}`), so tests can run in parallel and in any order.
- **Live prices.** Values from one response are compared with a floating point tolerance (9 decimals).
  Values from different requests (Scenario 2a) are fetched in parallel, compared with a USD tolerance and
  re-checked with `expect.toPass()`, so a price tick between requests does not make the test flaky.
- **Rate limiting.** The API is behind a per-IP rate limit (HTTP 429 with `Retry-After`). The client waits
  for the time the server asks for and retries, and the suite runs with 2 workers to keep bursts small.
- **Contract checks.** Responses are validated with [zod](https://zod.dev) schemas that declare only the
  fields the tests rely on, so new API fields don't break the suite but missing or mistyped ones do.

## Project structure

```
src/
  api/walletApiClient.ts     API client: auth header, request helpers, 429 retry
  config/env.ts              configuration and the addresses under test
  schemas/                   zod response contracts for both endpoints
  utils/portfolio.ts         portfolio value calculations
  fixtures.ts                Playwright fixture providing a fresh client per test
tests/
  tokens.spec.ts             Scenario 1 + tokens endpoint coverage
  balances.spec.ts           Scenario 2 + balances endpoint coverage
.github/workflows/           CI: runs on push, PR, manually and daily
```

## Reporting

Every run produces:

- console output (`list` reporter)
- an HTML report in `reports/html` (`npm run report`)
- a JUnit XML file in `reports/junit.xml`

On GitHub Actions the HTML report is uploaded as a build artifact and the JUnit results are published as a
test summary on the run page.

## Observations about the API

Found while writing the tests:

1. **Inconsistent validation of public keys.** `GET /tokens/abc` returns `400 Invalid public key provided`,
   but `POST /balances` with `pubkeys: ["1abc"]` returns `200` with empty data: the key is silently dropped.
   Only keys with non-base58 characters are rejected (400). Documented by the test
   *"silently ignores a base58 string that is not a valid public key"*.
2. **`Bearer` prefix not enforced.** Sending the bare uuid as the `Authorization` value (without `Bearer `) is
   accepted with `200`.
3. **Errors in different formats.** Validation errors come back as `{type, message, code, data}` from one
   layer and `{error, status}` from another, and a missing `Authorization` header returns a Cloudflare HTML
   page instead of JSON.
4. Tokens without market data have no `price` field at all (rather than `price: null`).
