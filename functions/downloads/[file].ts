/**
 * Send installer clicks to the GitHub blob CDN, not github.com.
 * github.com shows a Sign in page; the file itself is public.
 */
const ALLOWED = new Set([
  "MonkeyCards.ipa",
  "MonkeyCards.apk",
  "blinkywink-mac.dmg",
  "blinkywink-windows-setup.exe",
  "blinkywink-mac.app.tar.gz",
]);

const SOURCE =
  "https://github.com/blinkywink/blinkywink.github.io/releases/latest/download";

export async function onRequestGet(context: {
  params: { file?: string };
}): Promise<Response> {
  const file = String(context.params.file ?? "").trim();
  if (!ALLOWED.has(file)) {
    return new Response("Not found", { status: 404 });
  }

  let url = `${SOURCE}/${encodeURIComponent(file)}`;
  for (let i = 0; i < 8; i++) {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": "MonkeyCards-download/1.0" },
    });
    if (res.status < 300 || res.status >= 400) {
      return new Response("Download unavailable", { status: 502 });
    }
    const loc = res.headers.get("Location");
    if (!loc) return new Response("Download unavailable", { status: 502 });
    url = new URL(loc, url).href;
    const host = new URL(url).hostname;
    if (host !== "github.com" && host !== "www.github.com") {
      return Response.redirect(url, 302);
    }
    if (host === "github.com" && url.includes("/login")) {
      return new Response("Download unavailable", { status: 502 });
    }
  }
  return new Response("Download unavailable", { status: 502 });
}
