import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { prefersKeyboardAutofocus } from "../lib/focus";

type Mode = "signin" | "signup";

/** Inline sign-in / sign-up for mobile profile (no PC modal). */
export function ProfileAuthPanel() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    }
  }

  return (
    <div className="profile-auth">
      <header className="profile-auth__head">
        <h1>Account</h1>
        <p>
          {mode === "signup"
            ? "Create an account to save progress. New players start with 5,000 Cash."
            : "Sign in to sync Cash and cards."}
        </p>
      </header>

      <div className="profile-auth__tabs" role="tablist" aria-label="Account">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin"}
          className={mode === "signin" ? "is-active" : ""}
          onClick={() => {
            setMode("signin");
            setError(null);
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          className={mode === "signup" ? "is-active" : ""}
          onClick={() => {
            setMode("signup");
            setError(null);
          }}
        >
          Sign up
        </button>
      </div>

      <form
        className="auth-form profile-auth__form"
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
            autoFocus={prefersKeyboardAutofocus()}
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
  );
}
