import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "co.blinkywink.arcade",
  appName: "Monkey Cards",
  webDir: "dist",
  server: {
    androidScheme: "https",
    iosScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#0a0a0e",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a0e",
    },
  },
  ios: {
    /* We pad with env(safe-area-inset-*) ourselves (viewport-fit=cover). */
    contentInset: "never",
    preferredContentMode: "mobile",
    scrollEnabled: true,
    backgroundColor: "#0a0a0e",
  },
};

export default config;
