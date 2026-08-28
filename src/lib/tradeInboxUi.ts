/** Shared inbox open/badge state for desktop header + mobile nav badge. */

type Listener = () => void;

let badge = 0;
let open = false;
let isHot = false;
const listeners = new Set<Listener>();

function notify() {
  for (const fn of listeners) fn();
}

export type TradeInboxUiSnapshot = {
  badge: number;
  open: boolean;
  isHot: boolean;
};

export function getTradeInboxUiSnapshot(): TradeInboxUiSnapshot {
  return { badge, open, isHot };
}

export function subscribeTradeInboxUi(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setTradeInboxUiBadge(next: number, hot: boolean) {
  badge = next;
  isHot = hot;
  notify();
}

export function setTradeInboxUiOpen(next: boolean) {
  if (open === next) return;
  open = next;
  notify();
}

export function toggleTradeInboxUiOpen() {
  setTradeInboxUiOpen(!open);
}
