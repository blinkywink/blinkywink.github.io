/** Native OTA zips omit art/music; load them from Pages. */

import { Capacitor } from "@capacitor/core";

const CDN = "https://monkeycards.pages.dev";
const MEDIA = /^\/(images|sounds|music)\//;

export function nativeMediaUrl(url: string): string {
  const raw = String(url ?? "");
  if (!raw || /^(https?:|data:|blob:|capacitor:)/i.test(raw)) return raw;
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
    return raw;
  }
  if (!MEDIA.test(pathname)) return raw;
  return `${CDN}${pathname}${qs}`;
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
export function installNativeMediaCdn() {
  if (typeof window === "undefined") return;
  try {
    if (!Capacitor.isNativePlatform()) return;
  } catch {
    return;
  }

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
