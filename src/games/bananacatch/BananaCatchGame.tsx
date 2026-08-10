import { useEffect, useRef } from "react";
import { CashAmount } from "../../components/CurrencyChip";
import { GameHeader } from "../../components/GameHeader";
import {
  BANANA_IMAGE,
  CATCH_GOAL,
  CATCH_WIN_REWARD,
  MONKEY_IMAGE,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  RED_BLOON_IMAGE,
} from "./config";
import { useBananaCatch } from "./useBananaCatch";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: { cleared: boolean }) => void;
};

export function BananaCatchGame({ onBack, onRunEnd }: Props) {
  const { state, goal, start, restart, aimAt, setFieldSize } = useBananaCatch();
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
    if (was === "won" || was === "lost") return;
    if (state.phase === "won") onRunEnd?.({ cleared: true });
    else if (state.phase === "lost") onRunEnd?.({ cleared: false });
  }, [state.phase, onRunEnd]);

  const playing = state.phase === "playing";
  const done = state.phase === "won" || state.phase === "lost";

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
            <img src={BANANA_IMAGE} alt="" width={26} height={26} />
            <strong>
              {state.bananas}
              <span className="catch-stat__goal">/{goal}</span>
            </strong>
          </span>
          <span className="catch-stat" title="Lives">
            <img src={RED_BLOON_IMAGE} alt="" width={20} height={26} />
            <strong>{state.lives}</strong>
          </span>
          <span className="catch-stat catch-stat--cash">
            <CashAmount amount={state.cashEarned} size={18} />
          </span>
        </div>

        <p className="catch-hint">
          Slide to catch bananas · dodge red bloons
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
              src={d.kind === "banana" ? BANANA_IMAGE : RED_BLOON_IMAGE}
              alt=""
              draggable={false}
              style={{
                width: d.size,
                height: d.size,
                left: d.x,
                top: d.y,
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
                Catch <strong>{CATCH_GOAL}</strong> bananas. Avoid the reds.
              </p>
              <button type="button" className="btn btn--primary" onClick={start}>
                Start
              </button>
            </div>
          ) : null}

          {state.phase === "won" ? (
            <div className="catch-overlay is-win" role="status">
              <h2>Basket full!</h2>
              <p>
                {state.bananas} bananas ·{" "}
                <CashAmount amount={state.cashEarned} size={18} />
                <span className="catch-overlay__note">
                  {" "}
                  (includes +{CATCH_WIN_REWARD} clear bonus)
                </span>
              </p>
              <div className="catch-overlay__actions">
                <button type="button" className="btn btn--primary" onClick={restart}>
                  Play again
                </button>
                <button type="button" className="btn btn--ghost" onClick={onBack}>
                  Games
                </button>
              </div>
            </div>
          ) : null}

          {state.phase === "lost" ? (
            <div className="catch-overlay is-lose" role="status">
              <h2>Popped!</h2>
              <p>
                Caught {state.bananas}/{goal} · keep the monkey clear of bloons.
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
