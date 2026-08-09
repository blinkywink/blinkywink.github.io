import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
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
import { cardSpecById } from "../lib/cardCatalog";
import { formatPathLevels } from "../lib/pathCombos";
import { setProfileAvatar, avatarFromProfile } from "../lib/profileAvatar";
import { collectionPath, userCollectionPath } from "../lib/routes";
import { GameHeader } from "./GameHeader";
import { OwnedCardPicker } from "./OwnedCardPicker";
import { UserAvatar } from "./UserAvatar";

type EditorStep = "pick" | "crop";

export function ProfilePage() {
  const { ready, user, profile, isGuest, refreshProfile } = useAuth();
  const { owned } = useCardCollection();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorStep, setEditorStep] = useState<EditorStep>("pick");
  const [draft, setDraft] = useState<AvatarCrop>(DEFAULT_AVATAR_CROP);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const saved = useMemo(
    () => (profile ? avatarFromProfile(profile) : DEFAULT_AVATAR_CROP),
    [profile],
  );

  const pickSelected = useMemo(
    () => new Set(draft.cardId ? [draft.cardId] : []),
    [draft.cardId],
  );

  const draftCard = draft.cardId ? cardSpecById(draft.cardId) : null;

  useEffect(() => {
    if (!editorOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) closeEditor();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [editorOpen, busy]);

  function openEditor() {
    setError(null);
    setStatus(null);
    setDraft(saved.cardId ? { ...saved } : { ...DEFAULT_AVATAR_CROP });
    setEditorStep(saved.cardId ? "crop" : "pick");
    setEditorOpen(true);
  }

  function closeEditor() {
    if (busy) return;
    setEditorOpen(false);
    setError(null);
  }

  async function onSet() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await setProfileAvatar(normalizeAvatarCrop(draft));
      await refreshProfile();
      setStatus("Profile picture updated.");
      setEditorOpen(false);
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
      setEditorOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear.");
    }
    setBusy(false);
  }

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

  const editor = editorOpen
    ? createPortal(
        <div className="pfp-editor" role="dialog" aria-modal="true" aria-labelledby="pfp-editor-title">
          <button
            type="button"
            className="pfp-editor__backdrop"
            aria-label="Close"
            disabled={busy}
            onClick={closeEditor}
          />
          <div className="pfp-editor__panel">
            <header className="pfp-editor__header">
              <div>
                <p className="pfp-editor__eyebrow">Profile picture</p>
                <h2 id="pfp-editor-title">
                  {editorStep === "pick" ? "Choose a card" : "Frame your card"}
                </h2>
              </div>
              <button
                type="button"
                className="pfp-editor__close"
                aria-label="Close"
                disabled={busy}
                onClick={closeEditor}
              >
                ×
              </button>
            </header>

            <ol className="pfp-editor__steps" aria-label="Steps">
              <li className={editorStep === "pick" ? "is-active" : "is-done"}>
                <span>1</span> Card
              </li>
              <li className={editorStep === "crop" ? "is-active" : ""}>
                <span>2</span> Crop
              </li>
            </ol>

            {error ? (
              <p className="profile-banner profile-banner--err">{error}</p>
            ) : null}

            {editorStep === "pick" ? (
              <div className="pfp-editor__body pfp-editor__body--pick">
                <p className="pfp-editor__hint">
                  Pick any card you own. You’ll crop it next.
                </p>
                <OwnedCardPicker
                  owned={owned}
                  selectedIds={pickSelected}
                  onToggle={(cardId) => {
                    setDraft({
                      cardId,
                      zoom: DEFAULT_AVATAR_CROP.zoom,
                      x: DEFAULT_AVATAR_CROP.x,
                      y: DEFAULT_AVATAR_CROP.y,
                    });
                    setEditorStep("crop");
                  }}
                />
              </div>
            ) : (
              <div className="pfp-editor__body pfp-editor__body--crop">
                <div className="pfp-editor__crop-layout">
                  <CropEditor crop={draft} onChange={setDraft} />

                  <aside className="pfp-editor__side">
                    {draftCard ? (
                      <div className="pfp-editor__card-meta">
                        <p className="pfp-editor__card-name">
                          {draftCard.entity.name}
                        </p>
                        <p className="pfp-editor__card-path">
                          {draftCard.isParagon
                            ? "Paragon"
                            : formatPathLevels(draftCard.pathLevels)}{" "}
                          · {draftCard.tower}
                        </p>
                      </div>
                    ) : null}

                    <div className="pfp-editor__previews">
                      <p>How it looks</p>
                      <div className="pfp-editor__preview-row">
                        <div>
                          <UserAvatar crop={draft} size={56} />
                          <span>Header</span>
                        </div>
                        <div>
                          <UserAvatar crop={draft} size={44} />
                          <span>Board</span>
                        </div>
                        <div>
                          <UserAvatar crop={draft} size={28} />
                          <span>Small</span>
                        </div>
                      </div>
                    </div>

                    <div className="pfp-editor__side-actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busy}
                        onClick={() => setEditorStep("pick")}
                      >
                        Different card
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busy || !draft.cardId}
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            zoom: DEFAULT_AVATAR_CROP.zoom,
                            x: DEFAULT_AVATAR_CROP.x,
                            y: DEFAULT_AVATAR_CROP.y,
                          }))
                        }
                      >
                        Reset crop
                      </button>
                    </div>
                  </aside>
                </div>
              </div>
            )}

            <footer className="pfp-editor__footer">
              {editorStep === "crop" ? (
                <>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => setEditorStep("pick")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy || !draft.cardId}
                    onClick={() => void onSet()}
                  >
                    {busy ? "Saving…" : "Set picture"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={closeEditor}
                >
                  Cancel
                </button>
              )}
            </footer>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="profile-page">
      <GameHeader title="PROFILE" icon="" />
      <main className="profile-main">
        {status ? (
          <p className="profile-banner profile-banner--ok">{status}</p>
        ) : null}

        <section className="profile-home">
          <div className="profile-home__avatar-wrap">
            <UserAvatar crop={saved} size={140} alt={`${user.username} avatar`} />
          </div>
          <div className="profile-home__meta">
            <h2>{user.username}</h2>
            <p>
              Your profile picture is a cropped card from your collection.
              Other players see it on the leaderboard and marketplace.
            </p>
            <div className="profile-home__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={openEditor}
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
      </main>
      {editor}
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
  const [dragging, setDragging] = useState(false);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
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
    setDragging(false);
  }

  function nudgeZoom(delta: number) {
    onChange({
      ...crop,
      zoom: clampAvatarZoom(crop.zoom + delta),
    });
  }

  return (
    <div className="avatar-crop">
      <div
        ref={stageRef}
        className={`avatar-crop__stage${dragging ? " is-dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <UserAvatar crop={crop} size={300} className="avatar-crop__live" />
        <div className="avatar-crop__ring" aria-hidden />
        {!dragging ? (
          <p className="avatar-crop__drag-hint">Drag to move</p>
        ) : null}
      </div>

      <div className="avatar-crop__zoom">
        <div className="avatar-crop__zoom-head">
          <span>Zoom</span>
          <span className="avatar-crop__zoom-val">
            {crop.zoom.toFixed(2)}×
          </span>
        </div>
        <div className="avatar-crop__zoom-row">
          <button
            type="button"
            className="avatar-crop__zoom-btn"
            aria-label="Zoom out"
            onClick={() => nudgeZoom(-0.1)}
          >
            −
          </button>
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
          <button
            type="button"
            className="avatar-crop__zoom-btn"
            aria-label="Zoom in"
            onClick={() => nudgeZoom(0.1)}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
