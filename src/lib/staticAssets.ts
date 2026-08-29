import { Capacitor } from "@capacitor/core";

/** Canonical static host — use www to avoid 308 redirects during Capgo downloads. */
export const STATIC_ASSET_ORIGIN = "https://www.monkeycards.app";

function onNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** On native, load media from the live site when the OTA bundle lacks static files. */
export function staticAssetUrl(path: string): string {
  const src = String(path ?? "").trim();
  if (!src.startsWith("/")) return src;
  if (!onNativeShell()) return src;
  return rewriteNativeAssetUrl(src);
}

export function rewriteNativeAssetUrl(raw: string): string {
  const src = String(raw ?? "").trim();
  if (!src.startsWith("/") || src.startsWith("//")) return src;
  try {
    const u = new URL(src, STATIC_ASSET_ORIGIN);
    return `${STATIC_ASSET_ORIGIN}${u.pathname}${u.search}`;
  } catch {
    return `${STATIC_ASSET_ORIGIN}${src}`;
  }
}

/** Route /images and /sounds to the live site — OTA ships code only. */
export function installNativeStaticAssetRewrites(): void {
  if (!onNativeShell() || typeof document === "undefined") return;
  if (document.documentElement.dataset.staticCdn === "1") return;
  document.documentElement.dataset.staticCdn = "1";

  const patchImg = (img: HTMLImageElement) => {
    const attr = img.getAttribute("src");
    if (!attr?.startsWith("/") || img.dataset.staticCdn === "1") return;
    img.dataset.staticCdn = "1";
    img.src = rewriteNativeAssetUrl(attr);
  };

  document
    .querySelectorAll("img[src^='/']")
    .forEach((el) => patchImg(el as HTMLImageElement));

  new MutationObserver((records) => {
    for (const rec of records) {
      rec.addedNodes.forEach((node) => {
        if (node instanceof HTMLImageElement) patchImg(node);
        else if (node instanceof Element) {
          node
            .querySelectorAll("img[src^='/']")
            .forEach((el) => patchImg(el as HTMLImageElement));
        }
      });
      if (
        rec.type === "attributes" &&
        rec.target instanceof HTMLImageElement &&
        rec.attributeName === "src"
      ) {
        patchImg(rec.target);
      }
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src"],
  });

  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/") && !input.startsWith("//")) {
      return origFetch(rewriteNativeAssetUrl(input), init);
    }
    return origFetch(input, init);
  };
}
