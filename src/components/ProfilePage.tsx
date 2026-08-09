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
import {
  cosmeticsFromProfile,
  hasPlayerChrome,
  normalizeAccentColor,
  playerChromeStyle,
  PROFILE_ACCENT_COST,
  PROFILE_AURA_COST,
  setProfileAccent,
  setProfileAura,
} from "../lib/profileCosmetics";
import {
  SHOWCASE_MAX,
  setProfileShowcase,
  showcaseFromProfile,
} from "../lib/profileShowcase";
import { collectionPath, userCollectionPath } from "../lib/routes";
import { PageHeader } from "./PageHeader";
import { CashAmount } from "./CurrencyChip";
import { OwnedCardPicker } from "./OwnedCardPicker";
import { MonkeyCard } from "./MonkeyCard";
import { UserAvatar } from "./UserAvatar";

type EditorStep = "pick" | "crop";

export function ProfilePage() {
  const { ready, user, profile, isGuest, refreshProfile, setCoinBalance } =
    useAuth();
  const { owned } = useCardCollection();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorStep, setEditorStep] = useState<EditorStep>("pick");
  const [draft, setDraft] = useState<AvatarCrop>(DEFAULT_AVATAR_CROP);
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [showcaseDraft, setShowcaseDraft] = useState<Set<string>>(new Set());
  const [auraOpen, setAuraOpen] = useState(false);
  const [auraDraft, setAuraDraft] = useState<Set<string>>(new Set());
  const [colorDraft, setColorDraft] = useState("#F0C84A");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const saved = useMemo(
    () => (profile ? avatarFromProfile(profile) : DEFAULT_AVATAR_CROP),
    [profile],
  );

  const savedShowcase = useMemo(
    () => (profile ? showcaseFromProfile(profile) : []),
    [profile],
  );

  const cosmetics = useMemo(
    () => (profile ? cosmeticsFromProfile(profile) : cosmeticsFromProfile({})),
    [profile],
  );

  const chromeOn = hasPlayerChrome(
    playerChromeStyle({
      accentColor: cosmetics.accentColor,
      auraCardId: cosmetics.auraCardId,
    }),
  );

  const auraSpec = cosmetics.auraCardId
    ? cardSpecById(cosmetics.auraCardId)
    : null;

  const showcaseSpecs = useMemo(
    () =>
      savedShowcase
        .map((id) => cardSpecById(id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [savedShowcase],
  );

  const pickSelected = useMemo(
    () => new Set(draft.cardId ? [draft.cardId] : []),
    [draft.cardId],
  );

  const draftCard = draft.cardId ? cardSpecById(draft.cardId) : null;

  useEffect(() => {
    const next = cosmetics.accentColor ?? "#F0C84A";
    setColorDraft(next);
  }, [cosmetics.accentColor]);

  useEffect(() => {
    if (!editorOpen && !showcaseOpen && !auraOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        if (auraOpen) closeAuraEditor();
        else if (showcaseOpen) closeShowcaseEditor();
        else closeEditor();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [editorOpen, showcaseOpen, auraOpen, busy]);

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

  function openShowcaseEditor() {
    setError(null);
    setStatus(null);
    setShowcaseDraft(new Set());
    setShowcaseOpen(true);
  }

  function closeShowcaseEditor() {
    if (busy) return;
    setShowcaseOpen(false);
    setError(null);
  }

  async function onAddShowcaseCard(cardId: string) {
    if (!cardId) return;
    if (savedShowcase.includes(cardId)) {
      setError("That card is already on your profile.");
      return;
    }
    if (savedShowcase.length >= SHOWCASE_MAX) {
      setError(`You can only show ${SHOWCASE_MAX} showcase cards.`);
      return;
    }
    const next = [...savedShowcase, cardId];
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await setProfileShowcase(next);
      await refreshProfile();
      setStatus("Added showcase card.");
      setShowcaseOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
    setBusy(false);
  }

  async function onRemoveShowcaseCard(cardId: string) {
    const next = savedShowcase.filter((id) => id !== cardId);
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await setProfileShowcase(next);
      await refreshProfile();
      setStatus("Removed showcase card.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    }
    setBusy(false);
  }

  async function onClearShowcase() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await setProfileShowcase([]);
      await refreshProfile();
      setStatus("Cleared showcase cards.");
      setShowcaseOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear.");
    }
    setBusy(false);
  }

  function openAuraEditor() {
    setError(null);
    setStatus(null);
    setAuraDraft(
      new Set(cosmetics.auraCardId ? [cosmetics.auraCardId] : []),
    );
    setAuraOpen(true);
  }

  function closeAuraEditor() {
    if (busy) return;
    setAuraOpen(false);
    setError(null);
  }

  async function onSaveAccent() {
    const color = normalizeAccentColor(colorDraft);
    if (!color) {
      setError("Pick a valid color.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const balance = await setProfileAccent(color);
      setCoinBalance(balance);
      await refreshProfile();
      setStatus(
        cosmetics.accentUnlocked
          ? "Profile color updated."
          : `Unlocked profile color for ${PROFILE_ACCENT_COST.toLocaleString()} Cash.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save color.");
    }
    setBusy(false);
  }

  async function onSaveAura(cardId: string) {
    if (!cardId) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const balance = await setProfileAura(cardId);
      setCoinBalance(balance);
      await refreshProfile();
      setStatus(
        cosmetics.auraUnlocked
          ? "Profile aura updated."
          : `Unlocked profile aura for ${PROFILE_AURA_COST.toLocaleString()} Cash.`,
      );
      setAuraOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save aura.");
    }
    setBusy(false);
  }

  async function onClearAura() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const balance = await setProfileAura(null);
      setCoinBalance(balance);
      await refreshProfile();
      setStatus("Profile aura cleared.");
      setAuraOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear aura.");
    }
    setBusy(false);
  }

  if (!ready) {
    return (
      <div className="profile-page">
        <PageHeader title="Profile" blurb="Loading…" />
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
                  multi={false}
                  confirmLabel="Use card"
                  onConfirm={(ids) => {
                    const cardId = ids[0];
                    if (!cardId) return;
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
                          <UserAvatar crop={draft} size={72} />
                          <span>Header</span>
                        </div>
                        <div>
                          <UserAvatar crop={draft} size={56} />
                          <span>Board</span>
                        </div>
                        <div>
                          <UserAvatar crop={draft} size={40} />
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

  const showcaseEditor = showcaseOpen
    ? createPortal(
        <div
          className="pfp-editor"
          role="dialog"
          aria-modal="true"
          aria-labelledby="showcase-editor-title"
        >
          <button
            type="button"
            className="pfp-editor__backdrop"
            aria-label="Close"
            disabled={busy}
            onClick={closeShowcaseEditor}
          />
          <div className="pfp-editor__panel">
            <header className="pfp-editor__header">
              <div>
                <p className="pfp-editor__eyebrow">Showcase cards</p>
                <h2 id="showcase-editor-title">Add one card</h2>
              </div>
              <button
                type="button"
                className="pfp-editor__close"
                aria-label="Close"
                disabled={busy}
                onClick={closeShowcaseEditor}
              >
                ×
              </button>
            </header>
            {error ? (
              <p className="profile-banner profile-banner--err">{error}</p>
            ) : null}
            <div className="pfp-editor__body pfp-editor__body--pick">
              <p className="pfp-editor__hint">
                Slot {savedShowcase.length + 1} of {SHOWCASE_MAX}. Pick one, then
                Apply at the bottom.
              </p>
              <OwnedCardPicker
                owned={owned}
                selectedIds={showcaseDraft}
                multi={false}
                unavailableIds={new Set(savedShowcase)}
                unavailableLabel="Already shown"
                disabled={busy}
                confirmLabel={busy ? "Saving…" : "Apply"}
                onConfirm={(ids) => {
                  const cardId = ids[0];
                  if (!cardId) return;
                  setShowcaseDraft(new Set([cardId]));
                  void onAddShowcaseCard(cardId);
                }}
              />
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  const auraEditor = auraOpen
    ? createPortal(
        <div
          className="pfp-editor"
          role="dialog"
          aria-modal="true"
          aria-labelledby="aura-editor-title"
        >
          <button
            type="button"
            className="pfp-editor__backdrop"
            aria-label="Close"
            disabled={busy}
            onClick={closeAuraEditor}
          />
          <div className="pfp-editor__panel">
            <header className="pfp-editor__header">
              <div>
                <p className="pfp-editor__eyebrow">Profile aura</p>
                <h2 id="aura-editor-title">Pick FX from a card</h2>
              </div>
              <button
                type="button"
                className="pfp-editor__close"
                aria-label="Close"
                disabled={busy}
                onClick={closeAuraEditor}
              >
                ×
              </button>
            </header>
            {error ? (
              <p className="profile-banner profile-banner--err">{error}</p>
            ) : null}
            <div className="pfp-editor__body pfp-editor__body--pick">
              <p className="pfp-editor__hint">
                Copies that card’s aura colors onto your profile chrome — not
                the tower portrait.
                {!cosmetics.auraUnlocked ? (
                  <>
                    {" "}
                    First unlock costs{" "}
                    <CashAmount amount={PROFILE_AURA_COST} size={14} />.
                  </>
                ) : null}
              </p>
              <OwnedCardPicker
                owned={owned}
                selectedIds={auraDraft}
                multi={false}
                disabled={busy}
                confirmLabel={
                  busy
                    ? "Saving…"
                    : cosmetics.auraUnlocked
                      ? "Apply aura"
                      : "Buy & apply"
                }
                onConfirm={(ids) => {
                  const cardId = ids[0];
                  if (!cardId) return;
                  setAuraDraft(new Set([cardId]));
                  void onSaveAura(cardId);
                }}
              />
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="profile-page">
      <PageHeader
        eyebrow="Account"
        title="Profile"
        blurb="Picture, cosmetics, and showcase cards for your public page."
      />
      <main className="profile-main">
        {status ? (
          <p className="profile-banner profile-banner--ok">{status}</p>
        ) : null}
        {error && !editorOpen && !showcaseOpen && !auraOpen ? (
          <p className="profile-banner profile-banner--err">{error}</p>
        ) : null}

        <section
          className={`profile-home${chromeOn || cosmetics.accentUnlocked ? " has-player-chrome" : ""}`}
          style={
            chromeOn || cosmetics.accentUnlocked
              ? playerChromeStyle({
                  accentColor: cosmetics.accentColor ?? colorDraft,
                  auraCardId: cosmetics.auraCardId,
                })
              : undefined
          }
        >
          <div className="profile-home__avatar-wrap">
            <UserAvatar crop={saved} size={168} alt={`${user.username} avatar`} />
          </div>
          <div className="profile-home__meta">
            <h2>{user.username}</h2>
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
            </div>
            <p className="profile-home__links">
              <Link to={collectionPath()}>My cards</Link>
              <span aria-hidden="true">·</span>
              <Link to={userCollectionPath(user.username)}>Public page</Link>
            </p>
          </div>
        </section>

        <section className="profile-cosmetics">
          <div className="profile-cosmetics__head">
            <div>
              <h3>Profile cosmetics</h3>
              <p>
                Custom color for your page and leaderboard chip. Aura copies FX
                colors from an owned card — not the tower art.
              </p>
            </div>
          </div>

          <div className="profile-cosmetics__grid">
            <div className="profile-cosmetics__card">
              <div className="profile-cosmetics__card-head">
                <h4>Color</h4>
                <span className="profile-cosmetics__price">
                  {cosmetics.accentUnlocked ? (
                    "Unlocked · free to change"
                  ) : (
                    <>
                      Unlock <CashAmount amount={PROFILE_ACCENT_COST} size={14} />
                    </>
                  )}
                </span>
              </div>
              <label className="profile-cosmetics__color">
                <span>Accent</span>
                <input
                  type="color"
                  value={colorDraft}
                  onChange={(e) => setColorDraft(e.target.value.toUpperCase())}
                  disabled={busy}
                />
                <code>{colorDraft}</code>
              </label>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={
                  busy ||
                  (!cosmetics.accentUnlocked &&
                    (profile?.coins ?? 0) < PROFILE_ACCENT_COST)
                }
                onClick={() => void onSaveAccent()}
              >
                {cosmetics.accentUnlocked
                  ? "Save color"
                  : "Buy & save color"}
              </button>
            </div>

            <div className="profile-cosmetics__card">
              <div className="profile-cosmetics__card-head">
                <h4>Aura</h4>
                <span className="profile-cosmetics__price">
                  {cosmetics.auraUnlocked ? (
                    "Unlocked · free to change"
                  ) : (
                    <>
                      Unlock <CashAmount amount={PROFILE_AURA_COST} size={14} />
                    </>
                  )}
                </span>
              </div>
              {auraSpec ? (
                <div className="profile-cosmetics__aura-preview">
                  <MonkeyCard
                    entity={auraSpec.entity}
                    pathLevels={auraSpec.pathLevels}
                    mode="preview"
                    owned
                    staticArt
                  />
                  <p>
                    FX from <strong>{auraSpec.entity.name}</strong>
                  </p>
                </div>
              ) : (
                <p className="profile-cosmetics__empty">No aura selected.</p>
              )}
              <div className="profile-cosmetics__aura-actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={
                    busy ||
                    (!cosmetics.auraUnlocked &&
                      (profile?.coins ?? 0) < PROFILE_AURA_COST)
                  }
                  onClick={openAuraEditor}
                >
                  {cosmetics.auraUnlocked
                    ? cosmetics.auraCardId
                      ? "Change aura"
                      : "Pick aura"
                    : "Buy & pick aura"}
                </button>
                {cosmetics.auraCardId ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => void onClearAura()}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="profile-showcase-edit">
          <div className="profile-showcase-edit__head">
            <div>
              <h3>Showcase cards</h3>
              <p>
                {savedShowcase.length}/{SHOWCASE_MAX} on your public page. Add one
                at a time.
              </p>
            </div>
            <div className="profile-showcase-edit__actions">
              {savedShowcase.length < SHOWCASE_MAX ? (
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={busy}
                  onClick={openShowcaseEditor}
                >
                  Add card
                </button>
              ) : null}
              {savedShowcase.length > 0 ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => void onClearShowcase()}
                >
                  Clear all
                </button>
              ) : null}
            </div>
          </div>
          {showcaseSpecs.length > 0 ? (
            <div className="profile-showcase-edit__row">
              {showcaseSpecs.map((card) => (
                <div key={card.id} className="profile-showcase-edit__slot">
                  <MonkeyCard
                    entity={card.entity}
                    pathLevels={card.pathLevels}
                    mode="preview"
                    owned
                  />
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={busy}
                    onClick={() => void onRemoveShowcaseCard(card.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="profile-showcase-edit__empty">None selected yet.</p>
          )}
        </section>
      </main>
      {editor}
      {showcaseEditor}
      {auraEditor}
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
        <UserAvatar crop={crop} size={340} className="avatar-crop__live" />
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
