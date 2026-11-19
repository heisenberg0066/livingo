import type { BackendMode } from "../../shared/types.ts";
import { isNativeApp } from "./native.ts";

export interface ConnectionConfig {
  mode: BackendMode;
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  vapidPublicKey: string;
}

const STORAGE_KEY = "livingo.connection";

function fromEnv(): ConnectionConfig {
  const mode = import.meta.env.VITE_BACKEND;
  return {
    mode: mode === "server" || mode === "supabase" ? mode : "local",
    apiUrl: import.meta.env.VITE_API_URL ?? "",
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
    vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "",
  };
}

export function loadConnection(): ConnectionConfig {
  const base = fromEnv();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<ConnectionConfig>;
    const mode = saved.mode === "server" || saved.mode === "supabase" || saved.mode === "local" ? saved.mode : base.mode;
    return { ...base, ...saved, mode };
  } catch {
    return base;
  }
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
