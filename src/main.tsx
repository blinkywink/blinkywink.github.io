import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { CardCollectionProvider } from "./auth/CardCollectionProvider";
import { HeroFxProvider } from "./auth/HeroFxProvider";
import { TowerCompleteProvider } from "./auth/TowerCompleteProvider";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { supabaseConfigured } from "./lib/supabase";
import "@fontsource/fredoka/latin-500.css";
import "@fontsource/fredoka/latin-600.css";
import "@fontsource/fredoka/latin-700.css";
import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-700.css";
import "@fontsource/nunito/latin-800.css";
import "@fontsource/luckiest-guy/latin-400.css";
import { initSiteTheme } from "./lib/siteTheme";
import { nativeShellReady } from "./lib/nativeShell";
import { installNativeMediaCdn } from "./lib/nativeMediaCdn";
import "./index.css";

installNativeMediaCdn();
initSiteTheme();

const root = document.getElementById("root")!;

function renderMissingConfig() {
  root.innerHTML = `
    <div style="min-height:100dvh;display:grid;place-items:center;padding:2rem;font-family:system-ui,sans-serif;background:#0c0c10;color:#f0f0f4;text-align:center">
      <div style="max-width:28rem">
        <h1 style="font-size:1.4rem;margin:0 0 0.75rem">Missing Supabase config</h1>
        <p style="margin:0 0 0.75rem;line-height:1.5;color:rgba(240,240,244,0.75)">
          Add these environment variables in the Vercel project settings, then redeploy:
        </p>
        <pre style="text-align:left;background:#16161c;padding:0.9rem 1rem;border-radius:10px;overflow:auto;font-size:0.85rem;line-height:1.5">VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY</pre>
        <p style="margin:0.9rem 0 0;font-size:0.9rem;color:rgba(240,240,244,0.55)">
          Use the same values as your local <code>.env.local</code>. Only the <code>VITE_</code> keys are needed for the frontend.
        </p>
      </div>
    </div>
  `;
}

function renderApp() {
  createRoot(root).render(
    <StrictMode>
      <AppErrorBoundary>
        <AuthProvider>
          <BrowserRouter>
            <HeroFxProvider>
              <TowerCompleteProvider>
                <CardCollectionProvider>
                  <App />
                </CardCollectionProvider>
              </TowerCompleteProvider>
            </HeroFxProvider>
          </BrowserRouter>
        </AuthProvider>
      </AppErrorBoundary>
    </StrictMode>,
  );
}

async function boot() {
  await nativeShellReady;

  if (!supabaseConfigured) {
    renderMissingConfig();
    return;
  }

  renderApp();
}

void boot();
