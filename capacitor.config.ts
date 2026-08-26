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
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scrollEnabled: true,
  },
};

export default config;
