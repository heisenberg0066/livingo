import type { BackendMode } from "../../shared/types.ts";
import { isNativeApp } from "./native.ts";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabaseDefaults.ts";

export interface ConnectionConfig {
  mode: BackendMode;
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  vapidPublicKey: string;
}

const STORAGE_KEY = "livingo.connection";
export const DEMO_FLAG = "livingo.useDemo";

export function bakedConnection(): ConnectionConfig {
  const requested = import.meta.env.VITE_BACKEND;
  let mode: BackendMode = import.meta.env.PROD ? "supabase" : "local";
  if (requested === "server" || requested === "supabase" || requested === "local") mode = requested;
  return {
    mode,
    apiUrl: import.meta.env.VITE_API_URL ?? "",
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || SUPABASE_PUBLISHABLE_KEY,
    vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "",
  };
}

export function loadConnection(): ConnectionConfig {
  const base = bakedConnection();
  let config = base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<ConnectionConfig>;
      const mode = saved.mode === "server" || saved.mode === "supabase" || saved.mode === "local" ? saved.mode : base.mode;
      config = {
        ...base,
        ...saved,
        mode,
        supabaseUrl: saved.supabaseUrl?.trim() || base.supabaseUrl,
        supabaseAnonKey: saved.supabaseAnonKey?.trim() || base.supabaseAnonKey,
      };
    }
  } catch {
    config = base;
  }
  if (localStorage.getItem(DEMO_FLAG) === "1") return { ...config, mode: "local" };
  return config;
}

export function saveConnection(config: ConnectionConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resolveApiUrl(config: ConnectionConfig): string {
  const explicit = config.apiUrl.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  if (!isNativeApp() && window.location.protocol.startsWith("http")) return window.location.origin;
  return "";
}

export function connectionLabel(config: ConnectionConfig): string {
  if (config.mode === "server") return "Sync server";
  if (config.mode === "supabase") return "Supabase";
  return "This device";
}

/** Absolute path inside the deployed app, including a GitHub Pages subdirectory. */
export function appPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = import.meta.env.BASE_URL;
  if (!base || base === "/" || base === "./") return normalized;
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${prefix}${normalized}`;
}

export function routerBasename(): string | undefined {
  const base = import.meta.env.BASE_URL;
  if (!base || base === "/" || base === "./") return undefined;
  return base.endsWith("/") ? base.slice(0, -1) : base;
}
