import { test, expect } from '../src/fixtures';
import { addresses, env } from '../src/config/env';
import { tokensResponseSchema, type TokensResponse } from '../src/schemas/tokens.schema';
import { calculateTokensTotal } from '../src/utils/portfolio';

/** Parses the body against the response contract; a contract violation fails the test with zod's message. */
async function parseTokens(response: { json(): Promise<unknown> }): Promise<TokensResponse> {
  return tokensResponseSchema.parse(await response.json());
}

test.describe('GET /v3/portfolio/tokens/{address}', () => {
  test('Scenario 1: total portfolio value is correct for both addresses @scenario1', async ({ walletApi }) => {
    // One test for both addresses (as required); each address is reported as its own step,
    // and soft assertions make sure a failure on the first address doesn't hide the second.
    for (const address of addresses) {
      await test.step(`address ${address}`, async () => {
        const response = await walletApi.getTokens(address, 'mainnet');
        expect(response.status()).toBe(200);
        const body = await parseTokens(response);

        // Guard against a vacuous pass (0 == 0): the calculation must have real prices to work with.
        expect(body.tokens.some((token) => token.price), 'at least one token has a price').toBe(true);

        const calculatedTotal = calculateTokensTotal(body.tokens);
        const tokensPlusStocks = body.tokensValue.total + body.stocksValue.total;

        expect
          .soft(body.value.total, 'value.total should equal Σ(price × amount) over all tokens')
          .toBeCloseTo(calculatedTotal, 9);
        expect
          .soft(body.value.total, 'value.total should equal tokensValue.total + stocksValue.total')
          .toBeCloseTo(tokensPlusStocks, 9);
      });
    }
  });

  test('tokens and stocks subtotals match their own tokens', async ({ walletApi }) => {
    for (const address of addresses) {
      await test.step(`address ${address}`, async () => {
        const body = await parseTokens(await walletApi.getTokens(address, 'mainnet'));

        const stocks = body.tokens.filter((token) => token.isStock);
        const nonStocks = body.tokens.filter((token) => !token.isStock);

        expect.soft(body.stocksValue.total, 'stocksValue.total').toBeCloseTo(calculateTokensTotal(stocks), 9);
        expect.soft(body.tokensValue.total, 'tokensValue.total').toBeCloseTo(calculateTokensTotal(nonStocks), 9);
      });
    }
  });

  test('every token has a non-negative amount and a positive price when priced', async ({ walletApi }) => {
    for (const address of addresses) {
      await test.step(`address ${address}`, async () => {
        const body = await parseTokens(await walletApi.getTokens(address, 'mainnet'));

        expect(body.tokens.length).toBeGreaterThan(0);
        expect(body.errors).toEqual([]);
        for (const token of body.tokens) {
          expect.soft(token.totalUiAmount, `${token.symbol} amount`).toBeGreaterThanOrEqual(0);
          if (token.price) {
            expect.soft(token.price.price, `${token.symbol} price`).toBeGreaterThan(0);
            expect.soft(token.price.currency, `${token.symbol} currency`).toBe('usd');
          }
        }
      });
    }
  });

  for (const network of ['devnet', 'testnet'] as const) {
    test(`returns a valid, self-consistent response on ${network}`, async ({ walletApi }) => {
      const response = await walletApi.getTokens(addresses[0], network);
      expect(response.status()).toBe(200);
      const body = await parseTokens(response);

      expect(body.value.total).toBeCloseTo(calculateTokensTotal(body.tokens), 9);
    });
  }

  test('responds within the maximum response time for both addresses', async ({ walletApi }) => {
    for (const address of addresses) {
      const response = await walletApi.getTokens(address, 'mainnet');
      expect(response.status()).toBe(200);
      expect(walletApi.lastResponseTimeMs, `response time for ${address}`).toBeLessThanOrEqual(env.maxResponseTimeMs);
    }
  });

  test('defaults to mainnet when the network parameter is omitted', async ({ walletApi }) => {
    // Both calls are fired together so live price movement between them is minimal.
    const [withoutNetwork, mainnet] = await Promise.all([
      walletApi.getTokens(addresses[0]),
      walletApi.getTokens(addresses[0], 'mainnet'),
    ]);
    expect(withoutNetwork.status()).toBe(200);

    const defaultBody = await parseTokens(withoutNetwork);
    const mainnetBody = await parseTokens(mainnet);
    expect(defaultBody.tokens.map((t) => t.mint).sort()).toEqual(mainnetBody.tokens.map((t) => t.mint).sort());
    expect(Math.abs(defaultBody.value.total - mainnetBody.value.total)).toBeLessThanOrEqual(env.crossRequestTolerance);
  });

  test.describe('negative cases', () => {
    test('rejects an unsupported network with 400', async ({ walletApi }) => {
      const response = await walletApi.getTokens(addresses[0], 'foo');

      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({
        type: 'HttpValidationError',
        message: expect.stringContaining('"network" must be one of [mainnet, devnet, testnet]'),
      });
    });

    test('rejects an invalid public key with 400', async ({ walletApi }) => {
      const response = await walletApi.getTokens('not-a-solana-address', 'mainnet');

      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({ message: 'Invalid public key provided' });
    });

    test('rejects a request without Authorization header with 403', async ({ walletApi }) => {
      const response = await walletApi.getTokens(addresses[0], 'mainnet', { authorization: null });

      expect(response.status()).toBe(403);
    });

    test('rejects a Bearer token that is not a uuid with 403', async ({ walletApi }) => {
      const response = await walletApi.getTokens(addresses[0], 'mainnet', { authorization: 'Bearer not-a-uuid' });

      expect(response.status()).toBe(403);
      expect(await response.text()).toContain('Invalid API key');
    });
  });
});
