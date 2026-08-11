/** Keep decoded bitmaps alive so pack-summary thumbs don't come up blank. */
export function preloadImages(urls: string[]): HTMLImageElement[] {
  const seen = new Set<string>();
  const held: HTMLImageElement[] = [];
  for (const url of urls) {
    const src = String(url ?? "").trim();
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    void img.decode().catch(() => undefined);
    held.push(img);
  }
  return held;
}