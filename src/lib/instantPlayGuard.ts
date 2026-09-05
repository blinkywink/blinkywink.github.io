export function createInstantPlayGuard(opts: {
  /** Fast answers / lock-ins in a row before spam. */
  instantLimit: number;
  /** Fast "next" clicks in a row before spam. */
  nextLimit: number;
  /**
   * Awards this close together count as a fast streak (server mirrors this).
   * Default covers slider / guess games that aren't truly "instant".
   */
  awardGapMs?: number;
  /** Fast awards in a row before spam. */
  awardLimit?: number;
}) {
  let instant = 0;
  let next = 0;
  let awards = 0;
  let lastAwardAt = 0;
  const awardGapMs = opts.awardGapMs ?? 4000;
  const awardLimit = opts.awardLimit ?? 3;
  return {
    markAction(wasInstant: boolean): boolean {
      instant = wasInstant ? instant + 1 : 0;
      return instant >= opts.instantLimit;
    },
    markNext(wasInstant: boolean): boolean {
      next = wasInstant ? next + 1 : 0;
      return next >= opts.nextLimit;
    },
    /** Call whenever a puzzle pays Cash. Returns true when spam should trip. */
    markAward(): boolean {
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      awards =
        lastAwardAt > 0 && now - lastAwardAt < awardGapMs ? awards + 1 : 1;
      lastAwardAt = now;
      return awards >= awardLimit;
    },
    reset() {
      instant = 0;
      next = 0;
      awards = 0;
      lastAwardAt = 0;
    },
  };
}
