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

function shouldRewritePath(src: string): boolean {
  return src.startsWith("/") && !src.startsWith("//");
}

/** On native, load media from the live site when the OTA bundle lacks static files. */
export function staticAssetUrl(path: string): string {
  const src = String(path ?? "").trim();
  if (!shouldRewritePath(src)) return src;
  if (!onNativeShell()) return src;
  return rewriteNativeAssetUrl(src);
}

export function rewriteNativeAssetUrl(raw: string): string {
  const src = String(raw ?? "").trim();
  if (!shouldRewritePath(src)) return src;
  try {
    const u = new URL(src, STATIC_ASSET_ORIGIN);
    return `${STATIC_ASSET_ORIGIN}${u.pathname}${u.search}`;
  } catch {
    return `${STATIC_ASSET_ORIGIN}${src}`;
  }
}

function rewriteIfNeeded(raw: string): string {
  return shouldRewritePath(raw) ? rewriteNativeAssetUrl(raw) : raw;
}

function patchSrcProperty(proto: HTMLImageElement | HTMLAudioElement | HTMLSourceElement): void {
  const desc = Object.getOwnPropertyDescriptor(proto, "src");
  if (!desc?.set || !desc.get) return;
  if ((desc.set as { __staticCdn?: boolean }).__staticCdn) return;

  const set = function (this: HTMLImageElement | HTMLAudioElement, value: string) {
    desc.set!.call(this, rewriteIfNeeded(String(value ?? "")));
  };
  (set as { __staticCdn?: boolean }).__staticCdn = true;

  Object.defineProperty(proto, "src", {
    configurable: true,
    enumerable: desc.enumerable ?? true,
    get: desc.get,
    set,
  });
}

function patchSetAttribute(root: typeof Element.prototype): void {
  const orig = root.setAttribute;
  if ((orig as { __staticCdn?: boolean }).__staticCdn) return;

  root.setAttribute = function (
    this: Element,
    name: string,
    value: string,
  ): void {
    if (
      name === "src" &&
      (this instanceof HTMLImageElement ||
        this instanceof HTMLAudioElement ||
        this instanceof HTMLSourceElement) &&
      shouldRewritePath(value)
    ) {
      orig.call(this, name, rewriteNativeAssetUrl(value));
      return;
    }
    orig.call(this, name, value);
  };
  (root.setAttribute as { __staticCdn?: boolean }).__staticCdn = true;
}

function patchImageConstructor(): void {
  const NativeImage = window.Image;
  if ((NativeImage as { __staticCdn?: boolean }).__staticCdn) return;

  const PatchedImage = function Image(
    this: HTMLImageElement,
    width?: number,
    height?: number,
  ) {
    const img =
      typeof width === "number"
        ? new NativeImage(width, height ?? width)
        : new NativeImage();
    return img;
  } as unknown as typeof window.Image;

  PatchedImage.prototype = NativeImage.prototype;
  Object.setPrototypeOf(PatchedImage, NativeImage);
  (PatchedImage as { __staticCdn?: boolean }).__staticCdn = true;
  window.Image = PatchedImage;
}

function injectNativeCssAssetUrls(): void {
  const id = "native-static-cdn-css";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .game-preview__helium-meadow,
    .catch-field__sky {
      background-image: url("${STATIC_ASSET_ORIGIN}/images/bananas/monkey-meadow-bg.webp") !important;
    }
    .game-preview--catch {
      background:
        url("${STATIC_ASSET_ORIGIN}/images/bananas/monkey-meadow-bg.webp") center / 220% auto no-repeat,
        #3a7a3a !important;
    }
    .monkey-card__paragon-shine-sweep,
    .monkey-card__paragon-shine-glint {
      -webkit-mask-image: url("${STATIC_ASSET_ORIGIN}/images/ui/paragon-degree.webp") !important;
      mask-image: url("${STATIC_ASSET_ORIGIN}/images/ui/paragon-degree.webp") !important;
    }
  `;
  document.head.appendChild(style);
}

/** Route static paths to the live site — OTA ships code (+ pack mosaics) only. */
export function installNativeStaticAssetRewrites(): void {
  if (!onNativeShell() || typeof document === "undefined") return;
  if (document.documentElement.dataset.staticCdn === "1") return;
  document.documentElement.dataset.staticCdn = "1";

  patchSrcProperty(HTMLImageElement.prototype);
  patchSrcProperty(HTMLAudioElement.prototype);
  patchSrcProperty(HTMLSourceElement.prototype);
  patchSetAttribute(Element.prototype);
  patchImageConstructor();
  injectNativeCssAssetUrls();

  const patchImg = (img: HTMLImageElement) => {
    const attr = img.getAttribute("src");
    if (!attr || !shouldRewritePath(attr)) return;
    const next = rewriteNativeAssetUrl(attr);
    if (img.src !== next) img.src = next;
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
    if (typeof input === "string" && shouldRewritePath(input)) {
      return origFetch(rewriteNativeAssetUrl(input), init);
    }
    if (input instanceof Request) {
      const url = input.url;
      if (shouldRewritePath(url)) {
        return origFetch(
          new Request(rewriteNativeAssetUrl(url), input),
          init,
        );
      }
    }
    return origFetch(input, init);
  };
}
