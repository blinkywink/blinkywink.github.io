/** Connections - daily board + cheaper practice. */

export const CONNECTIONS_CONFIG = {
  groupCount: 4,
  groupSize: 4,
} as const;

/** Daily clear - one board per UTC day. */
export function connectionsDailyReward(): number {
  return 2800;
}

/** Practice boards pay less than the daily. */
export function connectionsPracticeReward(): number {
  return 450;
}

/** UTC calendar day key YYYY-MM-DD. */
export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function nextMidnightMs(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}
