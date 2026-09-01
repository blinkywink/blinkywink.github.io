/** Native OTA zips omit art/music. Load those folders from the IPA/APK bundle. */

import { Capacitor, registerPlugin } from "@capacitor/core";

const CDN = "https://monkeycards.pages.dev";
const MEDIA = /^\/(images|sounds|music)\//;

type BuiltinMediaPlugin = {
  getMediaBase(): Promise<{ base: string }>;
};

const BuiltinMedia = registerPlugin<BuiltinMediaPlugin>("BuiltinMedia");

/** WebView-accessible origin for bundled `public/` (no trailing slash). Empty = use site-relative paths. */
let mediaRoot = "";

function toWebSrc(base: string): string {
  const raw = String(base ?? "").trim();
  if (!raw) return "";
  const fileUrl = raw.startsWith("file:")
    ? raw
    : raw.startsWith("/")
      ? `file://${raw}`
      : raw;
  const converted = Capacitor.convertFileSrc(fileUrl).replace(/\/+$/, "");
  return converted;
}

function mediaPath(url: string): { path: string; qs: string } | null {
  const raw = String(url ?? "");
  if (!raw) return null;
  if (/^(data:|blob:)/i.test(raw)) return null;
  if (raw.startsWith(CDN)) {
    try {
      const u = new URL(raw);
      if (!MEDIA.test(u.pathname)) return null;
      return { path: u.pathname, qs: u.search };
    } catch {
      return null;
    }
  }
  if (/^(https?:|capacitor:)/i.test(raw) && !raw.startsWith("http://localhost") && !raw.startsWith("https://localhost")) {
    return null;
  }
  let pathname = raw;
  let qs = "";
  try {
    if (raw.startsWith("/")) {
      const q = raw.indexOf("?");
      pathname = q === -1 ? raw : raw.slice(0, q);
      qs = q === -1 ? "" : raw.slice(q);
    } else {
      const u = new URL(raw, "https://localhost/");
      pathname = u.pathname;
      qs = u.search;
    }
  } catch {
    return null;
  }
  if (!MEDIA.test(pathname)) return null;
  return { path: pathname, qs };
}

export function nativeMediaUrl(url: string): string {
  const parsed = mediaPath(url);
  if (!parsed) return url;
  if (!mediaRoot) return `${parsed.path}${parsed.qs}`;
  return `${mediaRoot}${parsed.path}${parsed.qs}`;
}

function applyCssMediaRoot(root: string) {
  if (typeof document === "undefined" || !root) return;
  const meadow = `url("${root}/images/bananas/monkey-meadow-bg.webp")`;
  const degree = `url("${root}/images/ui/paragon-degree.webp")`;
  document.documentElement.style.setProperty("--native-media-meadow", meadow);
  document.documentElement.style.setProperty("--native-media-paragon-degree", degree);
}

async function isCapgoOtaBundle(): Promise<boolean> {
  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    const cur = await CapacitorUpdater.current();
    const id = String(cur?.bundle?.id || "builtin").toLowerCase();
    return Boolean(id) && id !== "builtin" && id !== "unknown";
  } catch {
    return false;
  }
}

async function resolveMediaRoot(): Promise<string> {
  // Android APK intercepts /images|/sounds|/music from disk even after Capgo
  // swaps the web dir. Keep site-relative URLs so that handler can see them.
  if (Capacitor.getPlatform() === "android") return "";

  const ota = await isCapgoOtaBundle();
  if (!ota) return "";

  try {
    const { base } = await BuiltinMedia.getMediaBase();
    const converted = toWebSrc(base);
    if (converted) return converted;
  } catch {
    /* plugin ships in the IPA */
  }
  return "";
}

function patchSrc(ctor: { prototype: HTMLElement }) {
  try {
    const desc = Object.getOwnPropertyDescriptor(ctor.prototype, "src");
    if (!desc?.set) return;
    Object.defineProperty(ctor.prototype, "src", {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set(this: HTMLElement, value: string) {
        desc.set!.call(this, nativeMediaUrl(String(value)));
      },
    });
  } catch {
    /* older WebView */
  }
}

/** Call before any image/audio work in the native WebView. */
export async function installNativeMediaCdn() {
  if (typeof window === "undefined") return;
  try {
    if (!Capacitor.isNativePlatform()) return;
  } catch {
    return;
  }

  mediaRoot = await resolveMediaRoot();
  applyCssMediaRoot(mediaRoot);

  patchSrc(HTMLImageElement);
  patchSrc(HTMLAudioElement);
  patchSrc(HTMLSourceElement);

  const origAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function setAttribute(name, value) {
    if (name === "src" || name === "href") {
      value = nativeMediaUrl(String(value));
    }
    return origAttr.call(this, name, value);
  };

  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") {
      return origFetch(nativeMediaUrl(input), init);
    }
    if (input instanceof URL) {
      return origFetch(nativeMediaUrl(input.href), init);
    }
    if (input instanceof Request) {
      return origFetch(new Request(nativeMediaUrl(input.url), input), init);
    }
    return origFetch(input, init);
  };
}
