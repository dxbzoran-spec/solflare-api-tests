import { test as base, expect } from '@playwright/test';
import { WalletApiClient } from './api/walletApiClient';

/**
 * Custom fixtures: each test gets its own `walletApi` client with a fresh install id,
 * so tests never share state and can run in parallel and in any order.
 */
export const test = base.extend<{ walletApi: WalletApiClient }>({
  walletApi: async ({ request }, use) => {
    await use(new WalletApiClient(request));
  },
});

export { expect };
