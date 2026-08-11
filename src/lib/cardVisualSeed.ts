/** Per-copy art seeds for T5 and Paragon cards. */

export function needsVisualSeed(cardId: string): boolean {
  const id = String(cardId ?? "").trim();
  if (!id) return false;
  if (id.endsWith("-paragon")) return true;
  const m = id.match(/-(\d)-(\d)-(\d)$/);
  if (!m) return false;
  return Math.max(Number(m[1]), Number(m[2]), Number(m[3])) >= 5;
}

export function newVisualSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]!;
  }
  return Math.floor(Math.random() * 4294967296);
}

export function parseVisualSeed(raw: unknown): number | null {
  const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}
