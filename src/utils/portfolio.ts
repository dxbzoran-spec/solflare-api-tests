import type { Token } from '../schemas/tokens.schema';

/** Value of a single token position: price × amount. Tokens without a price are worth 0. */
export function tokenValue(token: Token): number {
  return (token.price?.price ?? 0) * token.totalUiAmount;
}

/** Sum of price × amount over the given tokens. */
export function calculateTokensTotal(tokens: Token[]): number {
  return sum(tokens.map(tokenValue));
}

export function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}
