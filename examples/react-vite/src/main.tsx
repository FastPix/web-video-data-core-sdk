import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// StrictMode intentionally double-invokes effects in dev to surface unsafe
// side effects. If destroy() didn't fully detach, you'd see duplicate views.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
