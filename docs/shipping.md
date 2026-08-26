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
| Android APK | https://github.com/blinkywink/blinkywink.github.io/releases/download/mobile/MonkeyCards.apk |
| iOS IPA | https://github.com/blinkywink/blinkywink.github.io/releases/download/mobile/MonkeyCards.ipa |

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
