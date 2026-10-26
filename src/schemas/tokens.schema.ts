import { z } from 'zod';

/**
 * Response contract for GET /v3/portfolio/tokens/{address}.
 * Only the fields the tests rely on are declared; unknown fields are allowed
 * so the suite does not break when the API adds new properties.
 */
const valueSummarySchema = z.object({
  total: z.number(),
  change: z.number(),
  percentage: z.number(),
});

const priceSchema = z.object({
  price: z.number(),
  currency: z.string(),
});

const tokenSchema = z.object({
  name: z.string().nullable(),
  symbol: z.string().nullable(),
  mint: z.string(),
  decimals: z.number().int().nonnegative(),
  totalUiAmount: z.number().nonnegative(),
  isStock: z.boolean(),
  // Tokens without market data (e.g. illiquid memecoins) come back without a `price` field.
  price: priceSchema.nullish(),
});

export const tokensResponseSchema = z.object({
  tokens: z.array(tokenSchema),
  value: valueSummarySchema,
  tokensValue: valueSummarySchema,
  stocksValue: valueSummarySchema,
  errors: z.array(z.unknown()),
});

export type Token = z.infer<typeof tokenSchema>;
export type TokensResponse = z.infer<typeof tokensResponseSchema>;
