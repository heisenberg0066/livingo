import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { warmVoices } from "./lib/tts.ts";
import "./index.css";

warmVoices();
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL;
    const script = base.startsWith("/") ? `${base}sw.js` : "/sw.js";
    void navigator.serviceWorker.register(script);
  });
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
