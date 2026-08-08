import { AccountBar } from "./AccountBar";

type Props = {
  onHome?: () => void;
};

/** Fixed top bar — brand + account, stays on every screen. */
export function SiteHeader({ onHome }: Props) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <button
          type="button"
          className="site-header__brand"
          onClick={onHome}
          aria-label="blinkywink.co home"
        >
          <img
            className="site-header__logo"
            src="/images/ui/site-logo.png"
            alt=""
            width={36}
            height={36}
            draggable={false}
          />
          <span>blinkywink.co</span>
        </button>
        <AccountBar />
      </div>
    </header>
  );
}
