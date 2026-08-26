# Sideload IPA (Capacitor iOS)

## Build on GitHub (recommended)

1. **Actions → iOS sideload IPA → Run workflow**
2. Download the **MonkeyCards-ios-sideload** artifact (`MonkeyCards.ipa`)
3. Open the IPA in your sideload tool and sign with your free Apple ID

Web build uses public `VITE_*` values from `.env.production` (same client keys the website already ships). Free Apple ID installs expire about every 7 days; re-sign to renew.

## Local (needs full Xcode app, not only CLT)

```bash
npm run mobile:sync
npm run mobile:ipa
# → ios-artifacts/MonkeyCards.ipa
```
