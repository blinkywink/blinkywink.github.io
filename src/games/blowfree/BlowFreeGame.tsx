import { useEffect, useRef } from "react";
import { GameHeader } from "../../components/GameHeader";
import { CashAmount } from "../../components/CurrencyChip";
import {
  BLOW_IMGS,
  BLOW_PIPE,
  type BlowColor,
  type Cell,
} from "./config";
import { endpointColor, pathComplete } from "./logic";
import { claimDailyHaulOnce, useBlowFree } from "./useBlowFree";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: {
    cleared: boolean;
    coinsEarned: number;
    mode: "daily" | "practice";
  }) => void;
};

function hasStep(path: Cell[] | undefined, a: Cell, b: Cell): boolean {
  if (!path) return false;
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i]!;
    const q = path[i + 1]!;
    if (
      (p.r === a.r && p.c === a.c && q.r === b.r && q.c === b.c) ||
      (p.r === b.r && p.c === b.c && q.r === a.r && q.c === a.c)
    ) {
      return true;
    }
  }
  return false;
}

function cellFromPoint(
  grid: HTMLDivElement,
  clientX: number,
  clientY: number,
): { r: number; c: number } | null {
  const el = document.elementFromPoint(clientX, clientY);
  const cell = el?.closest?.(".blowfree-cell") as HTMLElement | null;
  if (!cell || !grid.contains(cell)) return null;
  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);
  if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
  return { r, c };
}

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

export function BlowFreeGame({ onBack: _onBack, onRunEnd }: Props) {
  const {
    state,
    linked,
    pairs,
    filled,
    totalCells,
    allLinked,
    playPractice,
    resetLevel,
    markHaulReported,
    pointerDown,
    pointerEnter,
    pointerUp,
  } = useBlowFree();
  const gridRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const prevStatus = useRef(state.status);
  const dailyHaulLock = useRef(state.haulReported);
  const practiceHaulIds = useRef<Set<string>>(new Set());
  const runEndLock = useRef(false);

  useEffect(() => {
    if (state.status === "playing") {
      prevStatus.current = "playing";
      return;
    }

    const cameFromPlaying = prevStatus.current === "playing";

    if (state.mode === "daily") {
      const alreadyDone = !cameFromPlaying || state.haulReported;
      if (alreadyDone) {
        prevStatus.current = state.status;
        if (!state.haulReported && !dailyHaulLock.current) {
          dailyHaulLock.current = true;
          claimDailyHaulOnce(state.day);
          markHaulReported();
        }
        return;
      }

      // Fresh clear this visit — wait for payout so Nice Haul can show cash.
      // Keep prevStatus as playing until then so this doesn't look like a revisit.
      if (!state.awarded) return;
      if (runEndLock.current) return;
      runEndLock.current = true;
      prevStatus.current = state.status;
      onRunEnd?.({
        cleared: true,
        coinsEarned: state.reward,
        mode: "daily",
      });
      if (!dailyHaulLock.current) {
        dailyHaulLock.current = true;
        claimDailyHaulOnce(state.day);
        markHaulReported();
      }
      return;
    }

    if (!cameFromPlaying) {
      prevStatus.current = state.status;
      return;
    }
    if (!state.awarded) return;
    if (practiceHaulIds.current.has(state.level.id)) return;
    practiceHaulIds.current.add(state.level.id);
    prevStatus.current = state.status;
    onRunEnd?.({
      cleared: true,
      coinsEarned: state.reward,
      mode: "practice",
    });
  }, [
    state.status,
    state.mode,
    state.day,
    state.level.id,
    state.reward,
    state.awarded,
    state.haulReported,
    markHaulReported,
    onRunEnd,
  ]);

  useEffect(() => {
    const up = () => {
      dragging.current = false;
      pointerUp();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [pointerUp]);

  const size = state.level.size;
  const done = state.status === "won";
  const isDaily = state.mode === "daily";
  const needFill = allLinked && filled < totalCells && !done;
  const dailyDone = isDaily && done;

  return (
    <div className={`blowfree-page${done ? " is-done" : ""}`}>
      <GameHeader title="BLOW FREE" icon="" />

      <main className="blowfree-main">
        {!dailyDone ? (
          <div className="blowfree-hud">
            <span className="blowfree-stat">
              {isDaily ? "Daily" : "Practice"} · {size}×{size}
            </span>
            <span className="blowfree-stat">
              Linked <strong>{linked}</strong>
              <span className="blowfree-stat__dim">/{pairs}</span>
            </span>
            <span className="blowfree-stat">
              Filled <strong>{filled}</strong>
              <span className="blowfree-stat__dim">/{totalCells}</span>
            </span>
            {!done ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={resetLevel}
              >
                Clear lines
              </button>
            ) : null}
          </div>
        ) : null}

        {!dailyDone ? (
          <p className={`blowfree-hint${needFill ? " is-warn" : ""}`}>
            {done
              ? "Practice cleared."
              : needFill
                ? "All bloons linked - keep snaking until every cell is filled."
                : isDaily
                  ? "Connect matching bloons. Fill every cell to win."
                  : "Practice - same rules, smaller payout."}
          </p>
        ) : null}

        {!dailyDone ? (
          <div className="blowfree-stage">
            <div
              ref={gridRef}
              className="blowfree-grid"
              style={{
                gridTemplateColumns: `repeat(${size}, 1fr)`,
                gridTemplateRows: `repeat(${size}, 1fr)`,
              }}
              onPointerDown={(e) => {
                const grid = gridRef.current;
                if (!grid || done) return;
                const hit = cellFromPoint(grid, e.clientX, e.clientY);
                if (!hit) return;
                dragging.current = true;
                grid.setPointerCapture?.(e.pointerId);
                pointerDown(hit.r, hit.c);
              }}
              onPointerMove={(e) => {
                if (!dragging.current || !gridRef.current) return;
                const hit = cellFromPoint(
                  gridRef.current,
                  e.clientX,
                  e.clientY,
                );
                if (hit) pointerEnter(hit.r, hit.c);
              }}
            >
              {Array.from({ length: size * size }, (_, i) => {
                const r = Math.floor(i / size);
                const c = i % size;
                const end = endpointColor(state.level, r, c);
                let pipeColor: BlowColor | null = null;
                for (const p of state.level.pairs) {
                  if (
                    state.paths[p.color]?.some(
                      (cell) => cell.r === r && cell.c === c,
                    )
                  ) {
                    pipeColor = p.color;
                    break;
                  }
                }
                const color = pipeColor ?? end;
                const complete = color
                  ? pathComplete(state.level, state.paths, color)
                  : false;
                const path = color ? state.paths[color] : undefined;
                const up = hasStep(path, { r, c }, { r: r - 1, c });
                const down = hasStep(path, { r, c }, { r: r + 1, c });
                const left = hasStep(path, { r, c }, { r, c: c - 1 });
                const right = hasStep(path, { r, c }, { r, c: c + 1 });
                const onPipe = !!(
                  path && path.some((p) => p.r === r && p.c === c)
                );

                return (
                  <div
                    key={`${r}-${c}`}
                    className={`blowfree-cell${end ? " is-end" : ""}${complete ? " is-linked" : ""}${!onPipe && !end ? " is-empty" : ""}`}
                    data-r={r}
                    data-c={c}
                  >
                    {color && onPipe ? (
                      <>
                        <span
                          className="blowfree-joint"
                          style={{ background: BLOW_PIPE[color] }}
                        />
                        {left || right ? (
                          <span
                            className={`blowfree-arm blowfree-arm--h${left ? " l" : ""}${right ? " r" : ""}`}
                            style={{ background: BLOW_PIPE[color] }}
                          />
                        ) : null}
                        {up || down ? (
                          <span
                            className={`blowfree-arm blowfree-arm--v${up ? " u" : ""}${down ? " d" : ""}`}
                            style={{ background: BLOW_PIPE[color] }}
                          />
                        ) : null}
                      </>
                    ) : null}
                    {end ? (
                      <img
                        className="blowfree-bloon"
                        src={BLOW_IMGS[end]}
                        alt=""
                        draggable={false}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            {done && !isDaily ? (
              <div className="blowfree-cleared" role="status" aria-live="polite">
                <strong>Practice complete!</strong>
                {state.reward > 0 ? (
                  <span>
                    <CashAmount amount={state.reward} size={22} />
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {done ? (
          <div className="blowfree-result">
            <p className="blowfree-result__status is-win">
              {isDaily ? "Daily completed" : "Practice cleared"}
            </p>
            {state.reward > 0 ? (
              <p className="blowfree-result__cash">
                <CashAmount amount={state.reward} size={28} />
              </p>
            ) : isDaily ? (
              <p className="blowfree-hint">Already collected today's payout.</p>
            ) : null}
            {isDaily ? (
              <p className="blowfree-hint">
                Next daily in {formatCountdown(state.msUntilNext)}
              </p>
            ) : null}
            <div className="blowfree-result__actions">
              <button
                type="button"
                className="btn btn--primary blowfree-result__btn"
                onClick={playPractice}
                autoFocus
              >
                {isDaily ? "Practice" : "New practice"}
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
