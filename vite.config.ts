import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function sitePrefix(): string {
  const base = process.env.VITE_BASE || "/";
  if (base === "./" || base === ".") return "/";
  return base.endsWith("/") ? base : `${base}/`;
}

function manifestBody(prefix: string): string {
  return JSON.stringify(
    {
      name: "Livingo",
      short_name: "Livingo",
      description: "A private two-person streak for Swedish and French.",
      start_url: prefix,
      scope: prefix,
      display: "standalone",
      background_color: "#fff6ea",
      theme_color: "#fff6ea",
      lang: "en",
      icons: [
        { src: `${prefix}icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `${prefix}icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: `${prefix}icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  );
}

function pwaPaths(): Plugin {
  const prefix = sitePrefix();
  const body = manifestBody(prefix);
  return {
    name: "livingo-pwa-paths",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path === "/manifest.webmanifest") {
          res.setHeader("content-type", "application/manifest+json");
          res.end(body);
          return;
        }
        next();
      });
    },
    closeBundle() {
      if (!existsSync("dist/index.html")) return;
      writeFileSync("dist/manifest.webmanifest", body);
      copyFileSync("dist/index.html", "dist/404.html");
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react(), tailwindcss(), pwaPaths()],
  server: {
    host: "0.0.0.0",
    port: 47321,
    proxy: {
      "/api": "http://127.0.0.1:47322",
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 47321,
    proxy: {
      "/api": "http://127.0.0.1:47322",
    },
  },
});
