import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  getCardFaceImageUrl,
  peekCardFaceImageUrl,
  prefetchCardFaceImage,
} from "../lib/cardFaceImage";
import { prefersKeyboardAutofocus } from "../lib/focus";
import { btd6Pack } from "../lib/packTheme";
import { BoosterPack } from "./BoosterPack";
import { DesktopDownloadButtons } from "./DesktopDownloadButtons";
import { ExternalLink } from "./ExternalLink";
import { ZoomedPreview } from "./ArcadeHome";
import { DISCORD_INVITE_URL } from "../lib/openExternal";

export const OPEN_AUTH_EVENT = "ba:open-auth";

export type OpenAuthDetail = { mode?: "signin" | "signup" };

export function openAuthModal(mode: "signin" | "signup" = "signup") {
  window.dispatchEvent(
    new CustomEvent<OpenAuthDetail>(OPEN_AUTH_EVENT, { detail: { mode } }),
  );
}

type Step = 0 | 1 | 2;

type Props = {
  open: boolean;
  onClose: () => void;
};

const DEMO_CARD_ID = "super-monkey-5-2-0";
const HOWTO_STEP_KEY = "ba:howto-step";

function readStoredStep(): Step | null {
  try {
    const raw = sessionStorage.getItem(HOWTO_STEP_KEY);
    if (raw === "0" || raw === "1" || raw === "2") return Number(raw) as Step;
  } catch {
    /* ignore */
  }
  return null;
}

function writeStoredStep(step: Step | null) {
  try {
    if (step == null) sessionStorage.removeItem(HOWTO_STEP_KEY);
    else sessionStorage.setItem(HOWTO_STEP_KEY, String(step));
  } catch {
    /* ignore */
  }
}

export function HowToPlayOverlay({ open, onClose }: Props) {
  const { user, isGuest, signUp } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardSrc, setCardSrc] = useState<string | null>(() =>
    peekCardFaceImageUrl(DEMO_CARD_ID),
  );
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const wasOpen = useRef(false);

  const demoPack = btd6Pack();

  const goStep = (next: Step) => {
    setStep(next);
    writeStoredStep(next);
  };

  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }

    const opening = !wasOpen.current;
    wasOpen.current = true;

    if (opening) {
      const stored = readStoredStep();
      setStep(stored ?? 0);
      setUsername("");
      setPassword("");
      setError(null);
      setBusy(false);
    }

    prefetchCardFaceImage(DEMO_CARD_ID);
    let cancelled = false;
    const peeked = peekCardFaceImageUrl(DEMO_CARD_ID);
    if (peeked) setCardSrc(peeked);
    else {
      void getCardFaceImageUrl(DEMO_CARD_ID).then((url) => {
        if (!cancelled) setCardSrc(url);
      });
    }

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // After signup, land on the download step (survives auth remounts).
  useEffect(() => {
    if (!open || step !== 1) return;
    if (user && !isGuest) goStep(2);
  }, [open, step, user, isGuest]);

  async function onSignup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Persist before auth refresh so a remount still opens on step 3.
    writeStoredStep(2);
    const result = await signUp({ username, password });
    setBusy(false);
    if (result.error) {
      writeStoredStep(1);
      setError(result.error);
      return;
    }
    goStep(2);
  }

  function finish() {
    writeStoredStep(null);
    onClose();
  }

  if (!open) return null;

  return createPortal(
    <div
      className="howto-play"
      role="dialog"
      aria-modal="true"
      aria-labelledby="howto-play-title"
    >
      <button
        type="button"
        className="howto-play__backdrop"
        aria-label="Close"
        onClick={finish}
      />
      <div className="howto-play__panel">
        <p className="howto-play__step-label">{step + 1} / 3</p>

        {step === 0 ? (
          <>
            <h2 id="howto-play-title">How to play</h2>
            <div className="howto-play__examples" aria-hidden>
              <figure className="howto-play__example">
                <div className="howto-play__viz howto-play__viz--game">
                  <div className="game-card game-card--live howto-play__game-card">
                    <ZoomedPreview />
                    <div className="game-card__foot">
                      <span className="game-card__title">ZOOMED</span>
                      <span className="game-card__blurb">
                        Guess the tower from the image.
                      </span>
                    </div>
                  </div>
                </div>
                <figcaption>Play games</figcaption>
              </figure>
              <figure className="howto-play__example">
                <div className="howto-play__viz howto-play__viz--pack">
                  <BoosterPack
                    pack={demoPack}
                    effects={false}
                    className="howto-play__pack"
                  />
                </div>
                <figcaption>Buy packs</figcaption>
              </figure>
              <figure className="howto-play__example">
                <div className="howto-play__viz howto-play__viz--card">
                  {cardSrc ? (
                    <img
                      className="howto-play__card-img"
                      src={cardSrc}
                      alt=""
                      draggable={false}
                      decoding="async"
                    />
                  ) : null}
                </div>
                <figcaption>Collect cards</figcaption>
              </figure>
            </div>
            <ul className="howto-play__list">
              <li>Play arcade games to earn Cash</li>
              <li>Spend Cash on packs and cards in the shop</li>
              <li>Trade with players or sell cards on the market</li>
              <li>
                Tier 5+ cards and paragons each get unique art fx, so every copy
                is different
              </li>
            </ul>
            <div className="howto-play__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => goStep(1)}
              >
                Next
              </button>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h2 id="howto-play-title">Save your progress</h2>
            <div className="howto-play__body">
              <p>
                Sign up to get <strong>5,000 Cash</strong> and keep your
                collection saved.
              </p>
              <p className="howto-play__warn">
                There is no email, so please do not forget your username and
                password!
              </p>
            </div>
            <form
              className="auth-form howto-play__form"
              autoComplete="off"
              onSubmit={(e) => void onSignup(e)}
            >
              <label>
                Username
                <input
                  name="ba-howto-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  minLength={3}
                  maxLength={24}
                  required
                  placeholder="username"
                  autoFocus={prefersKeyboardAutofocus()}
                />
              </label>
              <label>
                Password
                <input
                  name="ba-howto-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                  placeholder="password"
                />
              </label>
              {error ? <p className="auth-form__error">{error}</p> : null}
              <div className="howto-play__actions">
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={busy}
                >
                  {busy ? "Working…" : "Sign up"}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={busy}
                  onClick={() => goStep(2)}
                >
                  Not now
                </button>
              </div>
            </form>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h2 id="howto-play-title">Get the app</h2>
            <div className="howto-play__body">
              <p>Download the app for faster loading times.</p>
              <DesktopDownloadButtons className="howto-play__downloads" />
              <ExternalLink
                href={DISCORD_INVITE_URL}
                className="btn btn--secondary howto-play__discord"
              >
                Join the discord
              </ExternalLink>
              <p className="howto-play__fun">Have fun!</p>
            </div>
            <div className="howto-play__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={finish}
              >
                Done
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
