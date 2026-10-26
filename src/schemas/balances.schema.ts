import { z } from 'zod';

/** Response contract for POST /v2/portfolio/balances. */
const walletBalanceSchema = z.object({
  publicKey: z.string(),
  value: z.number(),
});

export const balancesResponseSchema = z.object({
  netWorth: z.number(),
  netWorthChange: z.number(),
  data: z.array(walletBalanceSchema),
});

export type BalancesResponse = z.infer<typeof balancesResponseSchema>;
