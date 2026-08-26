import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { marketplacePath, shopPath } from "../lib/routes";

function IconMarket() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 10h16v9.5H4z" />
      <path d="M4 10 6.2 5h11.6L20 10" />
      <path d="M10 19.5v-5h4v5" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 18 9 12l6-6" />
    </svg>
  );
}

type Props = {
  className?: string;
  children?: ReactNode;
};

/** Shop → Market (shown on mobile shop top). */
export function ShopToMarketLink({ className = "" }: Props) {
  return (
    <Link
      to={marketplacePath()}
      className={`shop-market-swap ${className}`.trim()}
    >
      <span className="shop-market-swap__icon">
        <IconMarket />
      </span>
      To market
    </Link>
  );
}

/** Market → Shop. */
export function MarketToShopLink({ className = "" }: Props) {
  return (
    <Link to={shopPath()} className={`shop-market-swap ${className}`.trim()}>
      <span className="shop-market-swap__icon">
        <IconBack />
      </span>
      Back to shop
    </Link>
  );
}
