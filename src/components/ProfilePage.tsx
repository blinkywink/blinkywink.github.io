import {
  useCallback,
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
import { useIsCompactViewport } from "./MobileAppNav";
import { MobileInboxStrip } from "./MobileInboxStrip";
import { ProfileAuthPanel } from "./ProfileAuthPanel";
import {
  clamp01,
  clampAvatarZoom,
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
  type AvatarCrop,
} from "../lib/avatar";
import { cardSpecById } from "../lib/cardCatalog";
import { formatPathLevels } from "../lib/pathCombos";
import { APP_VERSION } from "../lib/appVersion";
import { setProfileAvatar, avatarFromProfile } from "../lib/profileAvatar";
import {
  prefetchCardFaceImage,
  type CardFaceBakeOpts,
} from "../lib/cardFaceImage";
import {
  PROFILE_ACCENT_CHANGE_COST,
  PROFILE_ACCENT_COST,
  cosmeticsFromProfile,
  hasPlayerChrome,
  normalizeAccentColor,
  playerChromeStyle,
  setProfileAccent,
} from "../lib/profileCosmetics";
import {
  AUTO_PACK_OPEN_COST,
  autoPackUnlockedFromProfile,
  buyAutoPackOpen,
} from "../lib/autoPackOpen";
import {
  SHOWCASE_CHANGE_COST,
  SHOWCASE_MAX,
  SHOWCASE_SLOT_COST,
  buyShowcaseSlot,
  setProfileShowcase,
  showcaseFromProfile,
  showcaseSlotsFromProfile,
} from "../lib/profileShowcase";
import {
  getLogoHomeId,
  LOGO_HOME_PAGES,
  setLogoHomeId,
  type LogoHomeId,
} from "../lib/logoHome";
import {
  getMobileNavSizeId,
  getMobileViewId,
  MOBILE_NAV_SIZE_OPTIONS,
  MOBILE_VIEW_OPTIONS,
  setMobileNavSizeId,
  setMobileViewId,
  type MobileNavSizeId,
  type MobileViewId,
} from "../lib/mobileView";
import {
  buySiteTheme,
  FREE_SITE_THEMES,
  getSiteThemeId,
  PREMIUM_SITE_THEMES,
  PREMIUM_THEME_COST,
  saveSiteThemeToServer,
  setSiteThemeId,
  subscribeSiteTheme,
  themeUnlockedFromProfile,
  type SiteThemeId,
} from "../lib/siteTheme";
import {
  getSfxVolume,
  playCardFocus,
  setSfxVolume,
  subscribeSfxVolume,
  unlockSfxAudio,
} from "../lib/packSounds";
import {
  accountStatsPath,
  collectionPath,
  userCollectionPath,
} from "../lib/routes";
import { CashAmount } from "./CurrencyChip";
import { OwnedCardPicker } from "./OwnedCardPicker";
import { MonkeyCard } from "./MonkeyCard";
import { UserAvatar } from "./UserAvatar";

type EditorStep = "pick" | "crop";

export function ProfilePage() {
  const {
    ready,
    user,
    profile,
    isGuest,
    displayName,
    refreshProfile,
    setCoinBalance,
    signOut,
  } = useAuth();
  const { owned, paragonOf, visualSeedOf } = useCardCollection();
  const isMobile = useIsCompactViewport();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorStep, setEditorStep] = useState<EditorStep>("pick");
  const [draft, setDraft] = useState<AvatarCrop>(DEFAULT_AVATAR_CROP);
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [showcaseDraft, setShowcaseDraft] = useState<Set<string>>(new Set());
  const [colorDraft, setColorDraft] = useState("#F0C84A");
  const [sfxVolume, setSfxVolumeState] = useState(() => getSfxVolume());
  const [logoHome, setLogoHomeState] = useState(() => getLogoHomeId());
  const [mobileViewDraft, setMobileViewDraft] = useState<MobileViewId>(() =>
    getMobileViewId(),
  );
  const [mobileViewSaved, setMobileViewSaved] = useState<MobileViewId>(() =>
    getMobileViewId(),
  );
  const [mobileNavSize, setMobileNavSize] = useState<MobileNavSizeId>(() =>
    getMobileNavSizeId(),
  );
  const [siteTheme, setSiteThemeState] = useState(() => getSiteThemeId());
  const [themeOfferId, setThemeOfferId] = useState<SiteThemeId | null>(null);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [themeSaving, setThemeSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => subscribeSfxVolume(setSfxVolumeState), []);
  useEffect(() => subscribeSiteTheme(setSiteThemeState), []);

  const saved = useMemo(
    () => (profile ? avatarFromProfile(profile) : DEFAULT_AVATAR_CROP),
    [profile],
  );

  const faceForCard = useCallback(
    (cardId: string | null | undefined) => {
      if (!cardId) return null;
      const spec = cardSpecById(cardId);
      return {
        degree: spec?.isParagon ? (paragonOf(cardId)?.degree ?? 1) : undefined,
        visualSeed: visualSeedOf(cardId),
      };
    },
    [paragonOf, visualSeedOf],
  );

  const savedFace = useMemo(
    () => faceForCard(saved.cardId),
    [faceForCard, saved.cardId],
  );
  const draftFace = useMemo(
    () => faceForCard(draft.cardId),
    [faceForCard, draft.cardId],
  );

  const savedShowcase = useMemo(
    () => (profile ? showcaseFromProfile(profile) : []),
    [profile],
  );

  const showcaseSlots = useMemo(
    () => (profile ? showcaseSlotsFromProfile(profile) : 0),
    [profile],
  );

  const cosmetics = useMemo(
    () => (profile ? cosmeticsFromProfile(profile) : cosmeticsFromProfile({})),
    [profile],
  );

  const chromeOn = hasPlayerChrome(
    playerChromeStyle({
      accentColor: cosmetics.accentColor,
    }),
  );

  const visibleShowcase = useMemo(
    () => savedShowcase.filter((id) => owned.has(id)),
    [savedShowcase, owned],
  );

  const showcaseSpecs = useMemo(
    () =>
      visibleShowcase
        .map((id) => cardSpecById(id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [visibleShowcase],
  );

  const pickSelected = useMemo(
    () => new Set(draft.cardId ? [draft.cardId] : []),
    [draft.cardId],
  );

  const draftCard = draft.cardId ? cardSpecById(draft.cardId) : null;

  useEffect(() => {
    if (saved.cardId) prefetchCardFaceImage(saved.cardId, savedFace ?? undefined);
  }, [saved.cardId, savedFace]);

  useEffect(() => {
    const next = cosmetics.accentColor ?? "#F0C84A";
    setColorDraft(next);
  }, [cosmetics.accentColor]);

  useEffect(() => {
    if (!editorOpen && !showcaseOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        if (showcaseOpen) closeShowcaseEditor();
        else closeEditor();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [editorOpen, showcaseOpen, busy]);

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
    if (visibleShowcase.includes(cardId)) {
      setError("That card is already on your profile.");
      return;
    }
    if (visibleShowcase.length >= showcaseSlots) {
      setError(
        showcaseSlots >= SHOWCASE_MAX
          ? `You can only show ${SHOWCASE_MAX} showcase cards.`
          : "Buy another showcase slot first.",
      );
      return;
    }
    const next = [...visibleShowcase, cardId];
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const balance = await setProfileShowcase(next);
      setCoinBalance(balance);
      await refreshProfile();
      setStatus(
        `Added showcase card (−${SHOWCASE_CHANGE_COST.toLocaleString()} Cash).`,
      );
      setShowcaseOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
    setBusy(false);
  }

  async function onRemoveShowcaseCard(cardId: string) {
    const next = visibleShowcase.filter((id) => id !== cardId);
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const balance = await setProfileShowcase(next);
      setCoinBalance(balance);
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
      const balance = await setProfileShowcase([]);
      setCoinBalance(balance);
      await refreshProfile();
      setStatus("Cleared showcase cards.");
      setShowcaseOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear.");
    }
    setBusy(false);
  }

  async function onBuyShowcaseSlot() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const balance = await buyShowcaseSlot();
      setCoinBalance(balance);
      await refreshProfile();
      setStatus(
        `Unlocked a showcase slot (−${SHOWCASE_SLOT_COST.toLocaleString()} Cash).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not buy slot.");
    }
    setBusy(false);
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
          ? `Profile color updated (−${PROFILE_ACCENT_CHANGE_COST.toLocaleString()} Cash).`
          : `Unlocked profile color for ${PROFILE_ACCENT_COST.toLocaleString()} Cash.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save color.");
    }
    setBusy(false);
  }

  async function onBuyAutoPackOpen() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const balance = await buyAutoPackOpen();
      setCoinBalance(balance);
      await refreshProfile();
      setStatus(
        `Unlocked Auto Pack Open (−${AUTO_PACK_OPEN_COST.toLocaleString()} Cash).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock.");
    }
    setBusy(false);
  }

  async function onPickTheme(themeId: SiteThemeId) {
    if (themeSaving) return;

    const unlocked = themeUnlockedFromProfile(themeId, profile);
    if (!unlocked) {
      setThemeOfferId(themeId);
      setThemeError(null);
      if (siteTheme !== themeId) setSiteThemeId(themeId);
      return;
    }

    setThemeOfferId(null);
    if (siteTheme === themeId) return;

    setSiteThemeId(themeId);
    setThemeError(null);
    setThemeSaving(true);
    const err = await saveSiteThemeToServer(themeId);
    if (err) {
      setThemeError(err);
      setThemeSaving(false);
      return;
    }
    await refreshProfile();
    setThemeSaving(false);
  }

  async function onBuyOfferedTheme() {
    if (!themeOfferId || themeSaving) return;
    if ((profile?.coins ?? 0) < PREMIUM_THEME_COST) {
      setThemeError("Not enough Cash for that theme.");
      return;
    }
    setThemeError(null);
    setThemeSaving(true);
    try {
      const balance = await buySiteTheme(themeOfferId);
      setCoinBalance(balance);
      setSiteThemeId(themeOfferId);
      setThemeOfferId(null);
      await refreshProfile();
      const label =
        PREMIUM_SITE_THEMES.find((t) => t.id === themeOfferId)?.label ??
        "theme";
      setStatus(
        `Unlocked ${label} (−${PREMIUM_THEME_COST.toLocaleString()} Cash).`,
      );
    } catch (err) {
      setThemeError(
        err instanceof Error ? err.message : "Could not unlock theme.",
      );
    }
    setThemeSaving(false);
  }

  if (!ready) {
    return (
      <div className="profile-page">
        <main className="profile-main">
          <p className="profile-empty">Loading…</p>
        </main>
      </div>
    );
  }

  if (isGuest || !user) {
    if (!isMobile) {
      return <Navigate to="/" replace />;
    }
    return (
      <div className="profile-page">
        <main className="profile-main">
          <ProfileAuthPanel />
        </main>
        <footer className="profile-page__footer">
          <p>
            v. {APP_VERSION}
            <span aria-hidden> · </span>
            thanks for playing!
          </p>
        </footer>
      </div>
    );
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
                  Pick any card you own. Next you’ll pan and zoom anywhere on the
                  full card.
                </p>
                <OwnedCardPicker
                  owned={owned}
                  selectedIds={pickSelected}
                  multi={false}
                  confirmLabel="Use card"
                  onConfirm={(ids) => {
                    const cardId = ids[0];
                    if (!cardId) return;
                    prefetchCardFaceImage(cardId, faceForCard(cardId) ?? undefined);
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
                  <CropEditor crop={draft} face={draftFace} onChange={setDraft} />

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
                          <UserAvatar crop={draft} face={draftFace} size={72} />
                          <span>Header</span>
                        </div>
                        <div>
                          <UserAvatar crop={draft} face={draftFace} size={56} />
                          <span>Board</span>
                        </div>
                        <div>
                          <UserAvatar crop={draft} face={draftFace} size={40} />
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
                Slot {visibleShowcase.length + 1} of {showcaseSlots}. Setting a
                card costs{" "}
                <CashAmount amount={SHOWCASE_CHANGE_COST} size={14} />.
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

  return (
    <div className="profile-page">
      <main className="profile-main">
        <MobileInboxStrip />
        {status ? (
          <p className="profile-banner profile-banner--ok">{status}</p>
        ) : null}
        {error && !editorOpen && !showcaseOpen ? (
          <p className="profile-banner profile-banner--err">{error}</p>
        ) : null}

        <section
          className={`profile-home${chromeOn || cosmetics.accentUnlocked ? " has-player-chrome" : ""}`}
          style={
            chromeOn || cosmetics.accentUnlocked
              ? playerChromeStyle({
                  accentColor: cosmetics.accentColor ?? colorDraft,
                })
              : undefined
          }
        >
          <div className="profile-home__avatar-wrap">
            <UserAvatar
              crop={saved}
              face={savedFace}
              size={168}
              alt={`${user.username} avatar`}
            />
          </div>
          <div className="profile-home__meta">
            <h2 className="profile-home__name">{user.username}</h2>
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
              <Link to={accountStatsPath()}>Stats</Link>
              <span aria-hidden="true">·</span>
              <Link to={userCollectionPath(user.username)}>Public page</Link>
            </p>
          </div>
        </section>

        <section className="profile-cosmetics" aria-label="Profile cosmetics">
          <div className="profile-cosmetics__head">
            <div>
              <h3>Profile cosmetics</h3>
              <p>Showcase cards and accent color for your public profile.</p>
            </div>
          </div>

          <div className="profile-cosmetics__block profile-showcase-edit">
            <div className="profile-showcase-edit__head">
              <div>
                <h4>Showcase cards</h4>
                <p>
                  {visibleShowcase.length}/{showcaseSlots} filled · {showcaseSlots}/
                  {SHOWCASE_MAX} slots owned. Slots cost{" "}
                  <CashAmount amount={SHOWCASE_SLOT_COST} size={13} />, setting a
                  card costs{" "}
                  <CashAmount amount={SHOWCASE_CHANGE_COST} size={13} />.
                </p>
              </div>
              <div className="profile-showcase-edit__actions">
                {showcaseSlots < SHOWCASE_MAX ? (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={
                      busy || (profile?.coins ?? 0) < SHOWCASE_SLOT_COST
                    }
                    onClick={() => void onBuyShowcaseSlot()}
                  >
                    Buy slot
                    <CashAmount amount={SHOWCASE_SLOT_COST} size={14} />
                  </button>
                ) : null}
                {visibleShowcase.length < showcaseSlots ? (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={
                      busy || (profile?.coins ?? 0) < SHOWCASE_CHANGE_COST
                    }
                    onClick={openShowcaseEditor}
                  >
                    Add card
                    <CashAmount amount={SHOWCASE_CHANGE_COST} size={14} />
                  </button>
                ) : null}
                {visibleShowcase.length > 0 ? (
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
                      degree={
                        card.isParagon ? paragonOf(card.id)?.degree : undefined
                      }
                      visualSeed={visualSeedOf(card.id)}
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
              <p className="profile-showcase-edit__empty">
                {showcaseSlots === 0
                  ? "Buy a showcase slot to get started."
                  : "None selected yet."}
              </p>
            )}
          </div>

          <div className="profile-cosmetics__grid">
            <div className="profile-cosmetics__card">
              <div className="profile-cosmetics__card-head">
                <h4>Accent color</h4>
                <span className="profile-cosmetics__price">
                  {cosmetics.accentUnlocked
                    ? "Applies to your page & leaderboard"
                    : "One-time unlock"}
                </span>
              </div>
              <label className="profile-cosmetics__color">
                <span>Color</span>
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
                className="btn btn--secondary profile-cosmetics__buy"
                disabled={
                  busy ||
                  (cosmetics.accentUnlocked
                    ? (profile?.coins ?? 0) < PROFILE_ACCENT_CHANGE_COST ||
                      normalizeAccentColor(colorDraft) === cosmetics.accentColor
                    : (profile?.coins ?? 0) < PROFILE_ACCENT_COST)
                }
                onClick={() => void onSaveAccent()}
              >
                {cosmetics.accentUnlocked ? "Save" : "Unlock"}
                <CashAmount
                  amount={
                    cosmetics.accentUnlocked
                      ? PROFILE_ACCENT_CHANGE_COST
                      : PROFILE_ACCENT_COST
                  }
                  size={16}
                />
              </button>
            </div>
          </div>
        </section>

        <section className="profile-settings" aria-label="Site settings">
          <div className="profile-settings__head">
            <div>
              <h3>Site settings</h3>
              <p>Theme, sound, and navigation preferences.</p>
            </div>
          </div>

          <div className="profile-settings__block">
            <div className="profile-settings__row">
              <div>
                <h4>Volume</h4>
                <p>Master volume for packs, shop, and hero voice lines.</p>
              </div>
              <strong className="profile-settings__pct">
                {Math.round(sfxVolume * 100)}%
              </strong>
            </div>
            <label className="profile-settings__volume">
              <span className="profile-settings__volume-label">Level</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(sfxVolume * 100)}
                onPointerDown={() => unlockSfxAudio()}
                onInput={(e) => {
                  setSfxVolume(Number(e.currentTarget.value) / 100);
                }}
                onChange={(e) => {
                  setSfxVolume(Number(e.currentTarget.value) / 100);
                }}
                onPointerUp={() => {
                  unlockSfxAudio();
                  if (getSfxVolume() > 0) playCardFocus();
                }}
              />
            </label>
          </div>

          <div className="profile-settings__block">
            <div className="profile-settings__row">
              <div>
                <h4>Theme</h4>
                <p>
                  Background and accent color for the whole site. Synced to your
                  account.
                </p>
              </div>
            </div>

            <div className="profile-settings__theme-group">
              <p className="profile-settings__theme-label">Free</p>
              <div
                className="profile-settings__themes"
                role="radiogroup"
                aria-label="Free site themes"
              >
                {FREE_SITE_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    role="radio"
                    className={`profile-settings__theme${siteTheme === theme.id ? " is-active" : ""}`}
                    aria-checked={siteTheme === theme.id}
                    aria-label={theme.label}
                    onClick={() => void onPickTheme(theme.id)}
                    disabled={themeSaving}
                  >
                    <span
                      className="profile-settings__theme-swatch"
                      style={{
                        background: theme.swatch,
                        backgroundColor: "transparent",
                      }}
                      aria-hidden
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="profile-settings__theme-group">
              <p className="profile-settings__theme-label">Premium</p>
              <div
                className="profile-settings__themes"
                role="radiogroup"
                aria-label="Premium site themes"
              >
                {PREMIUM_SITE_THEMES.map((theme) => {
                  const unlocked = themeUnlockedFromProfile(theme.id, profile);
                  const locked = !unlocked;
                  const offered = themeOfferId === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      role="radio"
                      className={[
                        "profile-settings__theme",
                        "is-premium",
                        siteTheme === theme.id ? "is-active" : "",
                        locked ? "is-locked" : "",
                        offered ? "is-offered" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-checked={siteTheme === theme.id}
                      aria-label={
                        locked ? `${theme.label}, locked` : theme.label
                      }
                      title={theme.label}
                      onClick={() => void onPickTheme(theme.id)}
                      disabled={themeSaving}
                    >
                      <span
                        className="profile-settings__theme-swatch"
                        style={{
                          background: theme.swatch,
                          backgroundColor: "transparent",
                        }}
                        aria-hidden
                      />
                      {locked ? (
                        <span className="profile-settings__theme-lock" aria-hidden>
                          ✦
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {themeOfferId ? (
                <div className="profile-settings__theme-offer">
                  <div>
                    <strong>
                      {PREMIUM_SITE_THEMES.find((t) => t.id === themeOfferId)
                        ?.label ?? "Premium"}
                    </strong>
                    <p>Locked - unlock to keep this theme.</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary profile-settings__buy"
                    disabled={
                      themeSaving ||
                      (profile?.coins ?? 0) < PREMIUM_THEME_COST
                    }
                    onClick={() => void onBuyOfferedTheme()}
                  >
                    {themeSaving ? "Unlocking…" : "Unlock"}
                    <CashAmount amount={PREMIUM_THEME_COST} size={16} />
                  </button>
                </div>
              ) : null}
            </div>
            {themeError ? (
              <p className="profile-banner profile-banner--err" role="alert">
                {themeError}
              </p>
            ) : null}
          </div>

          <div className="profile-settings__block">
            <div className="profile-settings__row">
              <div>
                <h4>Auto Open</h4>
                <p>Turn it on in the shop after purchasing a pack.</p>
              </div>
            </div>
            {autoPackUnlockedFromProfile(profile) ? (
              <p className="profile-settings__owned">Unlocked</p>
            ) : (
              <button
                type="button"
                className="btn btn--secondary profile-settings__buy"
                disabled={busy || (profile?.coins ?? 0) < AUTO_PACK_OPEN_COST}
                onClick={() => void onBuyAutoPackOpen()}
              >
                Unlock
                <CashAmount amount={AUTO_PACK_OPEN_COST} size={16} />
              </button>
            )}
          </div>

          <div className="profile-settings__block">
            <div className="profile-settings__row">
              <div>
                <h4>Home button</h4>
                <p>Where the Monkey Cards logo in the header takes you.</p>
              </div>
            </div>
            <label className="profile-settings__select">
              <span className="profile-settings__volume-label">Opens</span>
              <select
                value={logoHome}
                onChange={(e) => {
                  const next = e.target.value as LogoHomeId;
                  setLogoHomeId(next);
                  setLogoHomeState(next);
                }}
              >
                {LOGO_HOME_PAGES.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="profile-settings__block profile-settings__block--mobile-only">
            <div className="profile-settings__row">
              <div>
                <h4>Mobile View</h4>
                <p>
                  Classic keeps the website top bar. Modern uses a bottom app
                  bar.
                </p>
              </div>
            </div>
            <label className="profile-settings__select">
              <span className="profile-settings__volume-label">Layout</span>
              <select
                value={mobileViewDraft}
                onChange={(e) =>
                  setMobileViewDraft(e.target.value as MobileViewId)
                }
              >
                {MOBILE_VIEW_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn--secondary btn--sm profile-settings__save"
              disabled={mobileViewDraft === mobileViewSaved}
              onClick={() => {
                setMobileViewId(mobileViewDraft);
                setMobileViewSaved(mobileViewDraft);
              }}
            >
              Save
            </button>
          </div>

          <div className="profile-settings__block profile-settings__block--mobile-only">
            <div className="profile-settings__row">
              <div>
                <h4>Nav bar size</h4>
                <p>
                  Scales the Modern bottom bar height, icons, and labels.
                </p>
              </div>
            </div>
            <div
              className="profile-settings__nav-size"
              role="group"
              aria-label="Nav bar size"
            >
              {MOBILE_NAV_SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`profile-settings__nav-size-btn${
                    mobileNavSize === opt.id ? " is-active" : ""
                  }`}
                  aria-pressed={mobileNavSize === opt.id}
                  onClick={() => {
                    setMobileNavSizeId(opt.id);
                    setMobileNavSize(opt.id);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="profile-settings__block profile-settings__block--mobile-only">
            <div className="profile-settings__row">
              <div>
                <h4>Account</h4>
                <p>Signed in as {displayName || "player"}.</p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn--ghost profile-settings__sign-out"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        </section>
      </main>
      <footer className="profile-page__footer">
        <p>
          v. {APP_VERSION}
          <span aria-hidden> · </span>
          thanks for playing!
        </p>
      </footer>
      {editor}
      {showcaseEditor}
    </div>
  );
}

function CropEditor({
  crop,
  face,
  onChange,
}: {
  crop: AvatarCrop;
  face?: CardFaceBakeOpts | null;
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
        <UserAvatar
          crop={crop}
          face={face}
          size={340}
          className="avatar-crop__live"
        />
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
