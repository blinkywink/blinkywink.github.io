import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { isNativeShell } from "../../lib/nativeShell";

type Session = {
  maxLength: number;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

let inputEl: HTMLInputElement | null = null;
let session: Session | null = null;
let setCovering: ((on: boolean) => void) | null = null;

function nativeShowKeyboard() {
  if (!isNativeShell()) return;
  void import("@capacitor/keyboard")
    .then(({ Keyboard }) => Keyboard.show())
    .catch(() => {
      /* plugin optional on web */
    });
}

/** Call during a user gesture (pointer/click) before opening Bloonle. */
export function armBloonleKeyboard(): void {
  const el = inputEl;
  if (!el) return;
  el.readOnly = false;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
  nativeShowKeyboard();
}

export function releaseBloonleKeyboard(): void {
  session = null;
  setCovering?.(false);
  const el = inputEl;
  if (!el) return;
  if (document.activeElement === el) el.blur();
  el.value = "";
}

/**
 * Always-mounted invisible input so Bloonle can open the OS keyboard from the
 * game-card tap (iOS blocks focus after lazy route mount).
 */
export function BloonleKeyboardBridge() {
  const ref = useRef<HTMLInputElement>(null);
  const [covering, setCoveringState] = useState(false);

  useEffect(() => {
    inputEl = ref.current;
    setCovering = setCoveringState;
    return () => {
      if (inputEl === ref.current) inputEl = null;
      if (setCovering === setCoveringState) setCovering = null;
    };
  }, []);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    session?.onChange(e.target.value);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!session) return;
    if (e.key === "Enter") {
      e.preventDefault();
      session.onSubmit();
    }
  };

  return (
    <input
      ref={ref}
      className={`bloonle-kb-bridge${covering ? " is-covering" : ""}`}
      aria-label="Type your Bloonle guess"
      autoCapitalize="none"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="go"
      inputMode="text"
      onChange={onChange}
      onKeyDown={onKeyDown}
    />
  );
}

/** Wire Bloonle play state to the shared bridge input. */
export function useBloonleKeyboardSession(opts: {
  active: boolean;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const { active, value, maxLength, onChange, onSubmit } = opts;
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);
  onChangeRef.current = onChange;
  onSubmitRef.current = onSubmit;

  useEffect(() => {
    if (!active) {
      releaseBloonleKeyboard();
      return;
    }
    const s: Session = {
      maxLength,
      onChange: (v) => onChangeRef.current(v),
      onSubmit: () => onSubmitRef.current(),
    };
    session = s;
    setCovering?.(true);
    return () => {
      if (session === s) {
        session = null;
        setCovering?.(false);
      }
    };
  }, [active]);

  useEffect(() => {
    if (session && active) session.maxLength = maxLength;
  }, [active, maxLength]);

  useEffect(() => {
    if (!active || !inputEl) return;
    if (inputEl.value !== value) inputEl.value = value;
    inputEl.maxLength = maxLength > 0 ? maxLength : 20;
  }, [active, value, maxLength]);

  useEffect(() => {
    if (!active) return;
    const focus = () => armBloonleKeyboard();
    focus();
    const timers = [0, 40, 120, 280, 500].map((ms) =>
      window.setTimeout(focus, ms),
    );
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [active, maxLength]);
}
