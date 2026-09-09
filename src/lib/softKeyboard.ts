import { isNativeShell } from "./nativeShell";

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  const type = el.type.toLowerCase();
  return (
    type === "text" ||
    type === "search" ||
    type === "email" ||
    type === "password" ||
    type === "number" ||
    type === "tel" ||
    type === "url" ||
    type === ""
  );
}

/** Flag while a text field is focused so fixed docks / tab bar can hide. */
export function installSoftKeyboardState(): void {
  if (typeof document === "undefined") return;
  const flag = window as Window & { __softKeyboardInstalled?: boolean };
  if (flag.__softKeyboardInstalled) return;
  /* Native IPA always; mobile web (≤820) for the same keyboard hide behavior. */
  const want =
    isNativeShell() || window.matchMedia("(max-width: 820px)").matches;
  if (!want) return;
  flag.__softKeyboardInstalled = true;

  const root = document.documentElement;
  let blurTimer: number | undefined;

  const setOpen = (open: boolean) => {
    if (open) root.dataset.softKeyboard = "1";
    else delete root.dataset.softKeyboard;
  };

  const sync = () => {
    setOpen(isTextField(document.activeElement));
  };

  document.addEventListener(
    "focusin",
    (event) => {
      if (!isTextField(event.target)) return;
      window.clearTimeout(blurTimer);
      setOpen(true);
    },
    true,
  );

  document.addEventListener(
    "focusout",
    () => {
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(sync, 120);
    },
    true,
  );
}
