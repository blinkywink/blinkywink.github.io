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

## Mobile OTA (no App Store)

Sideloaded APK/IPA can pull **web** updates automatically (same “Updating” screen as desktop).

- On launch, the app checks `mobile-latest.json` and downloads `MonkeyCards-web.zip` when newer.
- Most game/UI changes ship via OTA when `main` updates (workflow **Mobile OTA web bundle**).
- If the native shell is too old (`minNativeVersion`), play is blocked with:  
  **Sorry, you need to redownload the app to update.**  
  (links to the latest APK/IPA)

```bash
npm run ship -- ota          # force publish web OTA now
npm run ship -- apk          # new native APK (+ raises minNativeVersion floor)
```
