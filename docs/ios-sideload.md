# Sideload IPA (Capacitor iOS)

## Cloud (recommended)

```bash
npm run ship -- ios
```

When the **iOS sideload IPA** workflow is green:

1. Download from the rolling release:  
   https://github.com/blinkywink/blinkywink.github.io/releases/download/mobile/MonkeyCards.ipa  
   (or Actions → artifact **MonkeyCards-ios-sideload**)
2. Open the IPA in Sideloadly / AltStore / etc. and sign with your Apple ID

Free Apple ID installs expire about every 7 days; re-sign to renew.

Web build uses public `VITE_*` values from `.env.production`.

## Local (needs full Xcode app)

```bash
npm run mobile:sync
npm run mobile:ipa
# → ios-artifacts/MonkeyCards.ipa
```

See also [shipping.md](./shipping.md) for APK / desktop cloud builds.
