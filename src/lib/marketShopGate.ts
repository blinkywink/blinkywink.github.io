/** Cash that must be spent in the shop before marketplace buys / offers. */
export const MARKET_SHOP_SPEND_REQUIRED = 5000;

export function shopSpendUnlocked(shopSpent: number | null | undefined): boolean {
  return (Number(shopSpent) || 0) >= MARKET_SHOP_SPEND_REQUIRED;
}

export function shopSpendRemaining(shopSpent: number | null | undefined): number {
  return Math.max(0, MARKET_SHOP_SPEND_REQUIRED - (Number(shopSpent) || 0));
}
