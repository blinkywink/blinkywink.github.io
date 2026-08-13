import { isDesktopShell } from "./desktopOnline";

export const DISCORD_INVITE_URL = "https://discord.gg/7XwcdHYzBE";
export const YOUTUBE_CHANNEL_URL = "https://youtube.com/@blinkywink";

/** Open http(s) links in the system browser (desktop) or a new tab (web). */
export async function openExternal(url: string): Promise<void> {
  const href = String(url ?? "").trim();
  if (!/^https?:\/\//i.test(href)) return;

  if (isDesktopShell()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(href);
      return;
    } catch (err) {
      console.warn("openExternal failed", err);
    }
  }

  window.open(href, "_blank", "noopener,noreferrer");
}
