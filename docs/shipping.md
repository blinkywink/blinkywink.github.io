# Shipping builds (cloud-first)

All installers are built on **GitHub Actions**. Your machine only bumps a version or triggers a workflow.

Auto-update for the desktop app still uses:

- `https://github.com/blinkywink/blinkywink.github.io/releases/latest/download/latest.json`
- site mirror `desktop-latest.json`

Mac / Windows download buttons on the site still point at `releases/latest`.

APK / IPA are **not** on the site yet (rolling `mobile` release only) until you say so.

## Commands

```bash
npm run clean                 # wipe local leftovers
npm run ship -- apk           # cloud APK → releases/tag/mobile
npm run ship -- ios           # cloud IPA → releases/tag/mobile
npm run ship -- mobile        # both mobile builds
npm run ship -- desktop       # bump patch, tag v*, CI builds Mac+Windows+updater
npm run ship -- desktop minor
npm run ship -- all           # desktop + mobile
```

## Downloads after Actions is green

| Platform | URL |
|---|---|
| Mac / Windows / updater | https://github.com/blinkywink/blinkywink.github.io/releases/latest |
| Android APK | https://github.com/blinkywink/blinkywink.github.io/releases/latest/download/MonkeyCards.apk |
| iOS IPA | https://github.com/blinkywink/blinkywink.github.io/releases/latest/download/MonkeyCards.ipa |

APK / IPA are also kept on the rolling `mobile` release for OTA (`MonkeyCards-web.zip`, `mobile-latest.json`).

## Secrets (already used by desktop CI)

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

## Local escape hatches (optional)

```bash
npm run desktop:build              # Mac only, needs updater key
npm run desktop:build:windows
npm run desktop:publish            # upload local builds (legacy)
npm run mobile:sync:android && npm run mobile:apk
npm run mobile:sync && npm run mobile:ipa
```

Prefer `npm run ship` so everything stays in the cloud.

## Mobile OTA (no App Store)

Sideloaded APK/IPA can pull **web** updates automatically (same “Updating” screen as desktop).

- On launch, the app checks `mobile-latest.json` and downloads `MonkeyCards-web.zip` when newer.
- Most game/UI changes ship via OTA when `main` updates (workflow **Mobile OTA web bundle**).
- If the native shell is too old (`minNativeVersion`), play is blocked with:  
  **Sorry, you need to redownload the app to update.**  
  (links to the `mobile` release APK/IPA)

```bash
npm run ship -- ota          # force publish web OTA now
npm run ship -- apk          # new native APK (+ raises minNativeVersion floor)
```
