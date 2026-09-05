export function createInstantPlayGuard(opts: {
  /** Instant answers / lock-ins in a row before spam. */
  instantLimit: number;
  /** Instant "next" clicks in a row before spam. */
  nextLimit: number;
}) {
  let instant = 0;
  let next = 0;
  return {
    markAction(wasInstant: boolean): boolean {
      instant = wasInstant ? instant + 1 : 0;
      return instant >= opts.instantLimit;
    },
    markNext(wasInstant: boolean): boolean {
      next = wasInstant ? next + 1 : 0;
      return next >= opts.nextLimit;
    },
    reset() {
      instant = 0;
      next = 0;
    },
  };
}
