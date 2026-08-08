import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthProvider";
import { CardCollectionProvider } from "./auth/CardCollectionProvider";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <CardCollectionProvider>
        <App />
      </CardCollectionProvider>
    </AuthProvider>
  </StrictMode>,
);
