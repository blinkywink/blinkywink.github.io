/** IPA/APK native version. Independent of desktop/website APP_VERSION.

    Format: 1.0.{native}.{build}
    - 1.0 stays the product line
    - last two numbers are mobile-only
    Web OTA bumps this so Capgo and the Profile footer show a new build.
    Do not bump MIN_NATIVE_VERSION unless the native shell itself must change.
*/
export const MOBILE_NATIVE_VERSION = "1.0.20.24";

/** Oldest IPA/APK allowed to run. Bump only when the native shell must change. */
export const MIN_NATIVE_VERSION = "1.0.20.9";
