import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import {
  clamp01,
  clampAvatarZoom,
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "../lib/avatar";
import {
  allCardSpecs,
  matchesCardQuery,
} from "../lib/cardCatalog";
import { setProfileAvatar, avatarFromProfile } from "../lib/profileAvatar";
import { collectionPath, userCollectionPath } from "../lib/routes";
import { GameHeader } from "./GameHeader";
import { MonkeyCard } from "./MonkeyCard";
import { UserAvatar } from "./UserAvatar";

type Step = "home" | "pick" | "crop";

export function ProfilePage() {
  const { ready, user, profile, isGuest, refreshProfile } = useAuth();
  const { owned } = useCardCollection();
  const [step, setStep] = useState<Step>("home");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<AvatarCrop>(DEFAULT_AVATAR_CROP);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const saved = useMemo(
    () => (profile ? avatarFromProfile(profile) : DEFAULT_AVATAR_CROP),
    [profile],
  );

  useEffect(() => {
    if (step === "home") setDraft(saved);
  }, [saved, step]);

  const ownedCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allCardSpecs().filter(
      (c) => owned.has(c.id) && matchesCardQuery(c, q),
    );
  }, [owned, query]);

  if (!ready) {
    return (
      <div className="profile-page">
        <GameHeader title="PROFILE" icon="" />
        <main className="profile-main">
          <p className="profile-empty">Loading…</p>
        </main>
      </div>
    );
  }

  if (isGuest || !user) {
    return <Navigate to="/" replace />;
  }

  async function onSet() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await setProfileAvatar(normalizeAvatarCrop(draft));
      await refreshProfile();
      setStatus("Profile picture updated.");
      setStep("home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
    setBusy(false);
  }

  async function onClear() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await setProfileAvatar(DEFAULT_AVATAR_CROP);
      await refreshProfile();
      setStatus("Profile picture removed.");
      setStep("home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear.");
    }
    setBusy(false);
  }

  return (
    <div className="profile-page">
      <GameHeader title="PROFILE" icon="" />
      <main className="profile-main">
        {error ? (
          <p className="profile-banner profile-banner--err">{error}</p>
        ) : null}
        {status ? (
          <p className="profile-banner profile-banner--ok">{status}</p>
        ) : null}

        {step === "home" ? (
          <section className="profile-home">
            <UserAvatar crop={saved} size={112} alt={`${user.username} avatar`} />
            <div className="profile-home__meta">
              <h2>{user.username}</h2>
              <p>Pick one of your cards, crop it, and use it as your PFP.</p>
              <div className="profile-home__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    setError(null);
                    setStatus(null);
                    setQuery("");
                    setDraft(saved.cardId ? saved : DEFAULT_AVATAR_CROP);
                    setStep("pick");
                  }}
                >
                  {saved.cardId ? "Change picture" : "Set picture"}
                </button>
                {saved.cardId ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => void onClear()}
                  >
                    Remove
                  </button>
                ) : null}
                <Link className="btn btn--secondary" to={collectionPath()}>
                  My cards
                </Link>
                <Link
                  className="btn btn--ghost"
                  to={userCollectionPath(user.username)}
                >
                  Public page
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        {step === "pick" ? (
          <section className="profile-pick">
            <div className="profile-step-bar">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setStep("home")}
              >
                ← Back
              </button>
              <h2>Choose a card</h2>
            </div>
            <label className="profile-search">
              <span>Search your cards</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tower, path, name…"
                autoComplete="off"
                autoFocus
              />
            </label>
            {ownedCards.length === 0 ? (
              <p className="profile-empty">No matching owned cards.</p>
            ) : (
              <div className="profile-pick-grid">
                {ownedCards.slice(0, 80).map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`profile-pick-card${draft.cardId === card.id ? " is-selected" : ""}`}
                    onClick={() => {
                      setDraft({
                        cardId: card.id,
                        zoom: DEFAULT_AVATAR_CROP.zoom,
                        x: DEFAULT_AVATAR_CROP.x,
                        y: DEFAULT_AVATAR_CROP.y,
                      });
                      setStep("crop");
                    }}
                  >
                    <MonkeyCard
                      entity={card.entity}
                      pathLevels={card.pathLevels}
                      mode="preview"
                      owned
                    />
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {step === "crop" && draft.cardId ? (
          <section className="profile-crop">
            <div className="profile-step-bar">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setStep("pick")}
              >
                ← Cards
              </button>
              <h2>Crop & zoom</h2>
            </div>
            <p className="profile-crop__hint">
              Drag to reposition. Use the slider to zoom, then press Set.
            </p>
            <CropEditor crop={draft} onChange={setDraft} />
            <div className="profile-crop__preview-row">
              <UserAvatar crop={draft} size={48} />
              <UserAvatar crop={draft} size={36} />
              <UserAvatar crop={draft} size={28} />
              <span>Header previews</span>
            </div>
            <div className="profile-home__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void onSet()}
              >
                {busy ? "Saving…" : "Set picture"}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => setStep("home")}
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function CropEditor({
  crop,
  onChange,
}: {
  crop: AvatarCrop;
  onChange: (next: AvatarCrop) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    px: number;
    py: number;
  } | null>(null);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      x: crop.x,
      y: crop.y,
      px: e.clientX,
      py: e.clientY,
    };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || !stageRef.current) return;
    const size = stageRef.current.clientWidth || 1;
    const dx = (e.clientX - drag.current.px) / (size * crop.zoom);
    const dy = (e.clientY - drag.current.py) / (size * crop.zoom);
    onChange({
      ...crop,
      x: clamp01(drag.current.x - dx),
      y: clamp01(drag.current.y - dy),
    });
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
  }

  return (
    <div className="avatar-crop">
      <div
        ref={stageRef}
        className="avatar-crop__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <UserAvatar crop={crop} size={220} className="avatar-crop__live" />
      </div>
      <label className="avatar-crop__zoom">
        <span>Zoom</span>
        <input
          type="range"
          min={1}
          max={3.5}
          step={0.05}
          value={crop.zoom}
          onChange={(e) =>
            onChange({
              ...crop,
              zoom: clampAvatarZoom(Number(e.target.value)),
            })
          }
        />
      </label>
    </div>
  );
}
