/** Shared inbox open/badge state for desktop header + mobile nav badge. */

type Listener = () => void;

let badge = 0;
let open = false;
let isHot = false;
const listeners = new Set<Listener>();

export type TradeInboxUiSnapshot = {
  badge: number;
  open: boolean;
  isHot: boolean;
};

/** Stable reference for useSyncExternalStore — must not allocate every read. */
let snapshot: TradeInboxUiSnapshot = { badge, open, isHot };

function publishSnapshot() {
  snapshot = { badge, open, isHot };
  for (const fn of listeners) fn();
}

export function getTradeInboxUiSnapshot(): TradeInboxUiSnapshot {
  return snapshot;
}

export function subscribeTradeInboxUi(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setTradeInboxUiBadge(next: number, hot: boolean) {
  if (badge === next && isHot === hot) return;
  badge = next;
  isHot = hot;
  publishSnapshot();
}

export function setTradeInboxUiOpen(next: boolean) {
  if (open === next) return;
  open = next;
  publishSnapshot();
}

export function toggleTradeInboxUiOpen() {
  setTradeInboxUiOpen(!open);
}

const refreshListeners = new Set<Listener>();

/** Force all mounted TradeInbox instances to refetch (e.g. after sending a request). */
export function requestTradeInboxRefresh() {
  for (const fn of refreshListeners) fn();
}

export function subscribeTradeInboxRefresh(fn: Listener) {
  refreshListeners.add(fn);
  return () => {
    refreshListeners.delete(fn);
  };
}

/** Profile-page mount point for the mobile inbox panel. */
let inboxSlot: HTMLElement | null = null;
const slotListeners = new Set<Listener>();

export function getTradeInboxSlot(): HTMLElement | null {
  return inboxSlot;
}

export function setTradeInboxSlot(el: HTMLElement | null) {
  if (inboxSlot === el) return;
  inboxSlot = el;
  for (const fn of slotListeners) fn();
}

export function subscribeTradeInboxSlot(fn: Listener) {
  slotListeners.add(fn);
  return () => {
    slotListeners.delete(fn);
  };
}
