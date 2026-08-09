import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { avatarFromProfile } from "../lib/profileAvatar";
import { collectionPath, profilePath } from "../lib/routes";
import { CurrencyChip } from "./CurrencyChip";
import { UserAvatar } from "./UserAvatar";

type Mode = "signin" | "signup";

export function AccountBar() {
  const { ready, user, profile, displayName, signIn, signUp, signOut } =
    useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setUsername("");
    setPassword("");
    setError(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent | PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!user) setMenuOpen(false);
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const result =
      mode === "signin"
        ? await signIn({ username, password })
        : await signUp({ username, password });

    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
  }

  const modal =
    open &&
    createPortal(
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <button
          type="button"
          className="auth-modal__backdrop"
          aria-label="Close"
          onClick={() => setOpen(false)}
        />
        <div className="auth-modal__panel">
          <button
            type="button"
            className="auth-modal__close"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <h2 id="auth-modal-title">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h2>
          <p className="auth-modal__blurb">
            {mode === "signup"
              ? "Create an account to save progress. New players start with 5,000 Cash."
              : "Username + password only — no email. Sign in to sync Cash and cards."}
          </p>

          <div className="auth-modal__tabs">
            <button
              type="button"
              className={mode === "signin" ? "is-active" : ""}
              onClick={() => setMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "signup" ? "is-active" : ""}
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
          </div>

          <form
            className="auth-form"
            autoComplete="off"
            onSubmit={(e) => void onSubmit(e)}
          >
            <label>
              Username
              <input
                name="ba-username"
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
                autoFocus
              />
            </label>
            <label>
              Password
              <input
                name="ba-password"
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

            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy
                ? "Working…"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        </div>
      </div>,
      document.body,
    );

  if (!ready) {
    return <div className="account-bar account-bar--loading" aria-hidden />;
  }

  if (user) {
    const avatar = profile ? avatarFromProfile(profile) : null;
    return (
      <div className="account-bar">
        <CurrencyChip amount={profile?.coins ?? 0} />
        <div className="account-menu" ref={menuRef}>
          <button
            type="button"
            className="account-menu__avatar"
            aria-label="Profile menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <UserAvatar crop={avatar} size={32} />
          </button>
          {menuOpen ? (
            <div className="account-menu__dropdown" role="menu">
              <p className="account-menu__user">{displayName}</p>
              <button
                type="button"
                className="account-menu__item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  navigate(profilePath());
                }}
              >
                My profile
              </button>
              <button
                type="button"
                className="account-menu__item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  navigate(collectionPath());
                }}
              >
                My cards
              </button>
              <button
                type="button"
                className="account-menu__item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void signOut();
                }}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="account-bar">
      <CurrencyChip amount={profile?.coins ?? 0} />
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
      >
        Sign in
      </button>
      {modal}
    </div>
  );
}
