/** IPA/APK native version. Independent of desktop/website APP_VERSION.

    Format: 1.0.{native}.{build}
    - 1.0 stays the product line
    - last two numbers are mobile-only
    Web OTA does not change this string; Capgo uses checksums instead.
*/
export const MOBILE_NATIVE_VERSION = "1.0.20.3";

/** Oldest IPA/APK allowed to run. Bump only when the native shell must change. */
export const MIN_NATIVE_VERSION = "1.0.20.2";
