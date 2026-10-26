import { randomUUID } from 'node:crypto';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { env, type Network } from '../config/env';

export interface BalancesRequestBody {
  pubkeys: string[];
  currency: string;
  general: boolean;
  network: Network | string;
}

/**
 * Per-request options.
 * `authorization` overrides the Authorization header: pass a custom value to send a malformed token,
 * or `null` to omit the header entirely (used by the negative tests).
 */
export interface RequestOptions {
  authorization?: string | null;
}

/**
 * Thin wrapper around the Solflare wallet API.
 *
 * Every instance simulates one app install: it generates its own uuid4 and sends it
 * as `Authorization: Bearer {uuid4}` with every request, as the real app does.
 * Methods return the raw `APIResponse` so tests can assert on status codes
 * (negative cases) as well as on the parsed body.
 *
 * The API sits behind a per-IP rate limit (HTTP 429 + `Retry-After`), so every request
 * transparently waits and retries when it is throttled instead of failing the test.
 */
export class WalletApiClient {
  readonly installId: string;

  constructor(
    private readonly request: APIRequestContext,
    installId: string = randomUUID(),
  ) {
    this.installId = installId;
  }

  /** GET /v3/portfolio/tokens/{address}?network={network} */
  getTokens(address: string, network?: Network | string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.send(() =>
      this.request.get(`/v3/portfolio/tokens/${address}`, {
        headers: this.headers(options),
        params: network ? { network } : undefined,
      }),
    );
  }

  /** POST /v2/portfolio/balances with an arbitrary body (useful for negative tests). */
  postBalances(body: Partial<BalancesRequestBody>, options: RequestOptions = {}): Promise<APIResponse> {
    return this.send(() =>
      this.request.post('/v2/portfolio/balances', {
        headers: this.headers(options),
        data: body,
      }),
    );
  }

  /**
   * Convenience wrapper for the happy path: builds a valid body from plain addresses,
   * adding the `1` prefix the endpoint expects (`1{address}`).
   */
  getBalances(
    addresses: readonly string[],
    { network = 'mainnet', currency = 'usd' }: { network?: Network; currency?: string } = {},
  ): Promise<APIResponse> {
    return this.postBalances({
      pubkeys: addresses.map(WalletApiClient.toBalancesPubkey),
      currency,
      general: true,
      network,
    });
  }

  /** The balances endpoint expects each address prefixed with `1`. */
  static toBalancesPubkey(address: string): string {
    return `1${address}`;
  }

  private headers({ authorization }: RequestOptions): Record<string, string> {
    if (authorization === null) return {};
    return { Authorization: authorization ?? `Bearer ${this.installId}` };
  }

  /** Sends the request, retrying on HTTP 429 after the delay the server asks for in `Retry-After`. */
  private async send(doRequest: () => Promise<APIResponse>): Promise<APIResponse> {
    for (let attempt = 1; ; attempt++) {
      const response = await doRequest();
      if (response.status() !== 429 || attempt > env.rateLimitRetries) return response;

      const retryAfterSeconds = Number(response.headers()['retry-after']) || 10;
      console.warn(`429 Too Many Requests, waiting ${retryAfterSeconds}s (retry ${attempt}/${env.rateLimitRetries})`);
      await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1_000));
    }
  }
}
