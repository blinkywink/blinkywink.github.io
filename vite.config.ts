import { rmSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Installers belong on GitHub Releases — never ship them with the website. */
function stripDistDownloads(): Plugin {
  return {
    name: "strip-dist-downloads",
    closeBundle() {
      rmSync(path.resolve("dist/downloads"), { recursive: true, force: true });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), stripDistDownloads()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            if (id.includes("/games/bloonhero/")) return "bloonhero";
            if (id.includes("/data/towers")) return "tower-data";
            return undefined;
          }
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("parse-sng") || id.includes("midi-file")) {
            return "bloonhero";
          }
          if (
            id.includes("react-dom") ||
            id.includes("react-router") ||
            /\/react\//.test(id)
          ) {
            return "react-vendor";
          }
          return undefined;
        },
      },
    },
  },
});
