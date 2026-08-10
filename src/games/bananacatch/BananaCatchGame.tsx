import { useEffect, useRef } from "react";
import { CashAmount } from "../../components/CurrencyChip";
import { GameHeader } from "../../components/GameHeader";
import { LivesMeter } from "../../components/LivesMeter";
import {
  BANANA_IMAGE,
  BFB_IMAGE,
  BLUE_BLOON_IMAGE,
  CATCH_CLEAR_BANANAS,
  CATCH_LIVES,
  GREEN_BLOON_IMAGE,
  MOAB_IMAGE,
  MONKEY_IMAGE,
  PINK_BLOON_IMAGE,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  RED_BLOON_IMAGE,
} from "./config";
import { useBananaCatch, type DropKind } from "./useBananaCatch";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: { cleared: boolean }) => void;
};

function dropSrc(kind: DropKind): string {
  switch (kind) {
    case "banana":
      return BANANA_IMAGE;
    case "blue":
      return BLUE_BLOON_IMAGE;
    case "green":
      return GREEN_BLOON_IMAGE;
    case "pink":
      return PINK_BLOON_IMAGE;
    case "moab":
      return MOAB_IMAGE;
    case "bfb":
      return BFB_IMAGE;
    case "red":
    default:
      return RED_BLOON_IMAGE;
  }
}

export function BananaCatchGame({ onBack, onRunEnd }: Props) {
  const { state, clearAt, start, restart, aimAt, setFieldSize } =
    useBananaCatch();
  const fieldRef = useRef<HTMLDivElement>(null);
  const prevPhase = useRef(state.phase);

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setFieldSize(box.width, box.height);
    });
    ro.observe(el);
    setFieldSize(el.clientWidth, el.clientHeight);
    return () => ro.disconnect();
  }, [setFieldSize]);

  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = state.phase;
    if (was === "lost") return;
    if (state.phase === "lost") {
      onRunEnd?.({ cleared: state.cleared });
    }
  }, [state.phase, state.cleared, onRunEnd]);

  const playing = state.phase === "playing";
  const done = state.phase === "lost";
  const attemptsUsed = CATCH_LIVES - state.lives;

  function pointerToAim(clientX: number) {
    const el = fieldRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    aimAt(clientX, rect.left, rect.width);
  }

  return (
    <div className={`catch-page${done ? " is-done" : ""}`}>
      <GameHeader title="BANANA CATCH" icon="" />

      <main className="catch-main">
        <div className="catch-hud">
          <span className="catch-stat" title="Bananas collected">
            <img src={BANANA_IMAGE} alt="" width={28} height={28} />
            <strong>{state.bananas}</strong>
          </span>
          <LivesMeter maxAttempts={CATCH_LIVES} attemptsUsed={attemptsUsed} />
          <span className="catch-stat catch-stat--cash">
            <CashAmount amount={state.cashEarned} size={18} />
          </span>
        </div>

        <p className="catch-hint">
          Catch bananas forever · dodge reds, blues, greens, pinks, then blimps
        </p>

        <div
          ref={fieldRef}
          className={`catch-field${playing ? " is-playing" : ""}`}
          role="application"
          aria-label="Banana catch playfield"
          onPointerDown={(e) => {
            if (!playing) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            pointerToAim(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!playing) return;
            pointerToAim(e.clientX);
          }}
        >
          <div className="catch-field__sky" aria-hidden="true" />

          {state.drops.map((d) => (
            <img
              key={d.id}
              className={`catch-drop catch-drop--${d.kind}`}
              src={dropSrc(d.kind)}
              alt=""
              draggable={false}
              style={{
                width: d.w,
                height: d.h,
                left: d.x,
                top: d.y,
                transform: `translate(-50%, -50%) rotate(${d.rot}deg)`,
              }}
            />
          ))}

          <img
            className="catch-player"
            src={MONKEY_IMAGE}
            alt=""
            draggable={false}
            style={{
              width: PLAYER_WIDTH,
              height: PLAYER_HEIGHT,
              left: `${state.playerX * 100}%`,
            }}
          />

          {state.phase === "ready" ? (
            <div className="catch-overlay">
              <img
                className="catch-overlay__monkey"
                src={MONKEY_IMAGE}
                alt=""
                draggable={false}
              />
              <h2>Ready to harvest?</h2>
              <p>
                Endless run, grab bananas, dodge everything. Survive for{" "}
                <strong>{CATCH_CLEAR_BANANAS}+</strong> bananas to clear.
              </p>
              <button type="button" className="btn btn--primary" onClick={start}>
                Start
              </button>
            </div>
          ) : null}

          {state.phase === "lost" ? (
            <div
              className={`catch-overlay${state.cleared ? " is-win" : " is-lose"}`}
              role="status"
            >
              <h2>{state.cleared ? "Solid haul!" : "Popped!"}</h2>
              <p>
                Caught <strong>{state.bananas}</strong> bananas ·{" "}
                <CashAmount amount={state.cashEarned} size={18} />
                {state.cleared ? (
                  <span className="catch-overlay__note">
                    Cleared ({clearAt}+ bananas), packs unlocked.
                  </span>
                ) : (
                  <span className="catch-overlay__note">
                    Reach {clearAt} bananas in one run to clear.
                  </span>
                )}
              </p>
              <div className="catch-overlay__actions">
                <button type="button" className="btn btn--primary" onClick={restart}>
                  Try again
                </button>
                <button type="button" className="btn btn--ghost" onClick={onBack}>
                  Games
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
