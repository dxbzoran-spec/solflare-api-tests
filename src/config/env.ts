/**
 * Central place for test configuration. Every value can be overridden
 * through an environment variable, so the suite runs unchanged locally and on CI.
 */
export const env = {
  baseUrl: process.env.BASE_URL ?? 'https://wallet-api.solflare.com',

  /**
   * Absolute tolerance (in USD) when comparing values taken from *different* requests.
   * Prices are live, so two calls a few hundred ms apart can differ slightly.
   */
  crossRequestTolerance: Number(process.env.CROSS_REQUEST_TOLERANCE ?? 0.01),

  /** How many times a request is retried after HTTP 429 (the API is rate limited per IP). */
  rateLimitRetries: Number(process.env.RATE_LIMIT_RETRIES ?? 3),

  /** Upper bound (ms) for a single request in the response-time tests. */
  maxResponseTimeMs: Number(process.env.MAX_RESPONSE_TIME_MS ?? 5_000),
};

/** Addresses under test, as given in the assignment. */
export const addresses = [
  '96Y3j66AX16noUAAVriW8bmwTGzV1PVqBKCEArPd5fuU',
  '7eXxD3vQww9cgBgD3gb7iqTriAzAmCBXFBMpdDi71P3i',
] as const;

export type Network = 'mainnet' | 'devnet' | 'testnet';
