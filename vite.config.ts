import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
