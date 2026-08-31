# Shipping builds

**Desktop (Mac + Windows):** build on your machine — much faster than Actions.  
**Mobile (APK / IPA / OTA):** GitHub Actions.

Auto-update for the desktop app uses:

- `https://github.com/blinkywink/blinkywink.github.io/releases/latest/download/latest.json`
- site mirror `desktop-latest.json`

Mac / Windows / Android / iOS download buttons on the site point at `releases/latest`.

## Commands

```bash
npm run clean                 # wipe local leftovers
npm run ship -- desktop       # bump patch, build Mac+Win locally, publish
npm run ship -- desktop minor
npm run ship -- apk           # cloud APK → latest + mobile release
npm run ship -- ios           # cloud IPA → latest + mobile release
npm run ship -- mobile        # both mobile builds
npm run ship -- ota           # force publish web OTA now
npm run ship -- all           # local desktop + cloud mobile
```

## Downloads after ship

| Platform | URL |
|---|---|
| Mac / Windows / updater | https://github.com/blinkywink/blinkywink.github.io/releases/latest |
| Android APK | https://github.com/blinkywink/blinkywink.github.io/releases/latest/download/MonkeyCards.apk |
| iOS IPA | https://github.com/blinkywink/blinkywink.github.io/releases/latest/download/MonkeyCards.ipa |

APK / IPA are also kept on the rolling `mobile` release for OTA (`MonkeyCards-web.zip`, `mobile-latest.json`).

## Secrets (optional cloud desktop rebuild)

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Local desktop uses `src-tauri/.updater-key` via `npm run desktop:build`.

## Local escape hatches

```bash
npm run desktop:build              # Mac app+dmg+updater
npm run desktop:build:windows      # Windows nsis (cargo-xwin)
npm run desktop:publish            # upload local builds to the current version tag
npm run mobile:sync:android && npm run mobile:apk
npm run mobile:sync && npm run mobile:ipa
```

Prefer `npm run ship` so version bump + publish stay consistent.

## Versions

- **Website + desktop:** `1.0.x` (`APP_VERSION` / `package.json` / Tauri). Desktop auto-update uses that.
- **Mobile IPA/APK:** `1.0.x.y` (`MOBILE_NATIVE_VERSION`). Last two numbers are mobile-only. Bump those when shipping a new IPA/APK — do not change desktop to match.
- **Mobile web OTA:** same `1.0.x.y` label as the current native line. Capgo decides “newer” by **checksum**, not by inventing 1.0.61. A fresh install (`builtin`) does **not** auto-OTA.

```bash
npm run ship -- ios          # new IPA (raises minNativeVersion to 1.0.x.y)
npm run ship -- apk          # new APK
npm run ship -- ota          # web-only; does not bump native
```

## Mobile OTA (no App Store)

Sideloaded APK/IPA can pull **web** updates in the background after the first install.

- Fresh IPA/APK plays immediately. It does not copy the whole site into a new Capgo bundle.
- Later launches on an already-OTA’d install check `mobile-latest.json` and download only changed JS/CSS.
- If the native shell is too old (`minNativeVersion`), play is blocked with:  
  **Sorry, you need to redownload the app to update.**  
  (links to the latest APK/IPA)

```bash
npm run ship -- ota          # force publish web OTA now
npm run ship -- apk          # new native APK (+ raises minNativeVersion floor)
```
