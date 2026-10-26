import { test, expect } from '../src/fixtures';
import { WalletApiClient } from '../src/api/walletApiClient';
import { addresses, env } from '../src/config/env';
import { balancesResponseSchema } from '../src/schemas/balances.schema';
import { tokensResponseSchema } from '../src/schemas/tokens.schema';
import { sum } from '../src/utils/portfolio';

const validBody = {
  pubkeys: addresses.map(WalletApiClient.toBalancesPubkey),
  currency: 'usd',
  general: true,
  network: 'mainnet',
};

test.describe('POST /v2/portfolio/balances', () => {
  test('Scenario 2a: net worth equals the sum of the total portfolio values from Scenario 1 @scenario2', async ({
    walletApi,
  }) => {
    // The tokens totals are fetched inside this test (not shared with Scenario 1) to keep tests independent.
    // All three requests are fired together to minimise live price drift between them, and the whole
    // block is retried if the values still drift apart (a single unlucky price tick shouldn't fail the run).
    await expect(async () => {
      const [balancesResponse, ...tokensResponses] = await Promise.all([
        walletApi.getBalances(addresses, { network: 'mainnet' }),
        ...addresses.map((address) => walletApi.getTokens(address, 'mainnet')),
      ]);

      expect(balancesResponse.status()).toBe(200);
      const balances = balancesResponseSchema.parse(await balancesResponse.json());
      const portfolioTotals = await Promise.all(
        tokensResponses.map(async (response) => tokensResponseSchema.parse(await response.json()).value.total),
      );

      const expectedNetWorth = sum(portfolioTotals);
      expect(
        Math.abs(balances.netWorth - expectedNetWorth),
        `netWorth ${balances.netWorth} vs Σ portfolio totals ${expectedNetWorth} (tolerance ${env.crossRequestTolerance})`,
      ).toBeLessThanOrEqual(env.crossRequestTolerance);
    }).toPass({ intervals: [1_000, 2_000, 5_000] });
  });

  test('Scenario 2b: net worth equals the sum of the wallet values @scenario2', async ({ walletApi }) => {
    const response = await walletApi.getBalances(addresses, { network: 'mainnet' });
    expect(response.status()).toBe(200);
    const balances = balancesResponseSchema.parse(await response.json());

    // Each requested address must be present exactly once (returned without the `1` prefix).
    expect(balances.data.map((wallet) => wallet.publicKey).sort()).toEqual([...addresses].sort());

    const walletsTotal = sum(balances.data.map((wallet) => wallet.value));
    expect(balances.netWorth, 'netWorth should equal Σ data[].value').toBeCloseTo(walletsTotal, 9);
  });

  test('each wallet value matches the total of its tokens portfolio', async ({ walletApi }) => {
    await expect(async () => {
      const [balancesResponse, ...tokensResponses] = await Promise.all([
        walletApi.getBalances(addresses),
        ...addresses.map((address) => walletApi.getTokens(address, 'mainnet')),
      ]);
      const balances = balancesResponseSchema.parse(await balancesResponse.json());

      for (const [index, address] of addresses.entries()) {
        const portfolioTotal = tokensResponseSchema.parse(await tokensResponses[index].json()).value.total;
        const walletValue = balances.data.find((wallet) => wallet.publicKey === address)?.value;

        expect(walletValue, `wallet value for ${address}`).toBeDefined();
        expect(Math.abs(walletValue! - portfolioTotal), `wallet ${address}`).toBeLessThanOrEqual(
          env.crossRequestTolerance,
        );
      }
    }).toPass({ intervals: [1_000, 2_000, 5_000] });
  });

  test('a single address returns a net worth equal to its own value', async ({ walletApi }) => {
    const balances = balancesResponseSchema.parse(await (await walletApi.getBalances([addresses[1]])).json());

    expect(balances.data).toHaveLength(1);
    expect(balances.netWorth).toBeCloseTo(balances.data[0].value, 9);
  });

  test('duplicate addresses are counted only once', async ({ walletApi }) => {
    const balances = balancesResponseSchema.parse(
      await (await walletApi.getBalances([addresses[0], addresses[0]])).json(),
    );

    expect(balances.data).toHaveLength(1);
    expect(balances.netWorth).toBeCloseTo(balances.data[0].value, 9);
  });

  test('an empty pubkeys list returns zero net worth', async ({ walletApi }) => {
    const response = await walletApi.postBalances({ ...validBody, pubkeys: [] });

    expect(response.status()).toBe(200);
    expect(balancesResponseSchema.parse(await response.json())).toEqual({ netWorth: 0, netWorthChange: 0, data: [] });
  });

  // The endpoint "supports all supported currencies": net worth must stay consistent in each of them.
  for (const currency of ['eur', 'gbp', 'jpy', 'chf', 'aud', 'cad', 'inr']) {
    test(`supports currency ${currency} with a consistent net worth`, async ({ walletApi }) => {
      const response = await walletApi.getBalances(addresses, { currency });

      expect(response.status()).toBe(200);
      const balances = balancesResponseSchema.parse(await response.json());
      expect(balances.data).toHaveLength(addresses.length);
      expect(balances.netWorth).toBeCloseTo(sum(balances.data.map((wallet) => wallet.value)), 9);
    });
  }

  for (const network of ['devnet', 'testnet'] as const) {
    test(`returns every wallet and a consistent net worth on ${network}`, async ({ walletApi }) => {
      const response = await walletApi.getBalances(addresses, { network });

      expect(response.status()).toBe(200);
      const balances = balancesResponseSchema.parse(await response.json());
      expect(balances.data.map((wallet) => wallet.publicKey).sort()).toEqual([...addresses].sort());
      expect(balances.netWorth).toBeCloseTo(sum(balances.data.map((wallet) => wallet.value)), 9);
    });
  }

  test.describe('negative cases', () => {
    test('rejects addresses without the `1` prefix with 400', async ({ walletApi }) => {
      const response = await walletApi.postBalances({ ...validBody, pubkeys: [...addresses] });

      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'Invalid pubkey data.' });
    });

    test('rejects an unsupported currency with 422', async ({ walletApi }) => {
      const response = await walletApi.postBalances({ ...validBody, currency: 'xyz' });

      expect(response.status()).toBe(422);
      expect(await response.json()).toMatchObject({ error: 'Unsupported currency.' });
    });

    test('rejects an unsupported network with 400', async ({ walletApi }) => {
      const response = await walletApi.postBalances({ ...validBody, network: 'foo' });

      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({ type: 'HttpValidationError' });
    });

    test('rejects a body without pubkeys with 400', async ({ walletApi }) => {
      const { pubkeys: _omitted, ...bodyWithoutPubkeys } = validBody;
      const response = await walletApi.postBalances(bodyWithoutPubkeys);

      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({ message: '"pubkeys" is required' });
    });

    test('rejects a request without Authorization header with 403', async ({ walletApi }) => {
      const response = await walletApi.postBalances(validBody, { authorization: null });

      expect(response.status()).toBe(403);
    });

    test('rejects a public key with non-base58 characters with 400', async ({ walletApi }) => {
      const response = await walletApi.postBalances({ ...validBody, pubkeys: ['1not-a-solana-address'] });

      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'Invalid pubkey data.' });
    });

    test('silently ignores a base58 string that is not a valid public key', async ({ walletApi }) => {
      // Observed behaviour: a valid base58 string of the wrong length (not a 32-byte key) is dropped
      // and 200 is returned, while GET /tokens answers 400 for the same input. Kept as a test to document it.
      test.info().annotations.push({
        type: 'observation',
        description: 'Inconsistent with GET /tokens, which returns 400 "Invalid public key provided" for the same key.',
      });
      const response = await walletApi.postBalances({ ...validBody, pubkeys: ['1abc'] });

      expect(response.status()).toBe(200);
      expect(balancesResponseSchema.parse(await response.json())).toEqual({ netWorth: 0, netWorthChange: 0, data: [] });
    });
  });
});
