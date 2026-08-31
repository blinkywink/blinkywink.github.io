/**
 * Resolve GitHub Release assets to the blob CDN so browsers never see
 * github.com's Sign in page. Does not stream the file through this host.
 */
import http from "node:http";

const PORT = Number(process.env.PORT ?? 3011);
const SOURCE =
  "https://github.com/blinkywink/blinkywink.github.io/releases/latest/download";
const ALLOWED = new Set([
  "MonkeyCards.ipa",
  "MonkeyCards.apk",
  "blinkywink-mac.dmg",
  "blinkywink-windows-setup.exe",
  "blinkywink-mac.app.tar.gz",
]);

function isGithubHtmlHost(hostname) {
  return hostname === "github.com" || hostname === "www.github.com";
}

async function blobUrl(file) {
  let url = `${SOURCE}/${encodeURIComponent(file)}`;
  for (let i = 0; i < 8; i++) {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": "MonkeyCards-download/1.0" },
    });
    if (res.status < 300 || res.status >= 400) return null;
    const loc = res.headers.get("location");
    if (!loc) return null;
    url = new URL(loc, url).href;
    const host = new URL(url).hostname;
    if (!isGithubHtmlHost(host)) return url;
    if (url.includes("/login")) return null;
  }
  return null;
}

const server = http.createServer((req, res) => {
  void (async () => {
    const path = String(req.url ?? "").split("?")[0] ?? "";
    const file = decodeURIComponent(path.replace(/^\/downloads\//, "").replace(/^\//, ""));
    if ((req.method !== "GET" && req.method !== "HEAD") || !ALLOWED.has(file)) {
      res.writeHead(404).end("Not found");
      return;
    }
    const loc = await blobUrl(file);
    if (!loc) {
      res.writeHead(502).end("Download unavailable");
      return;
    }
    res.writeHead(302, {
      Location: loc,
      "Cache-Control": "no-store",
    });
    res.end();
  })().catch(() => {
    if (!res.headersSent) res.writeHead(502).end("Download unavailable");
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`download-proxy on :${PORT}`);
});
