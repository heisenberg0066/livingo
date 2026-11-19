import type { BackendMode } from "../../../shared/types.ts";
import type { ConnectionConfig } from "../connection.ts";
import { resolveApiUrl } from "../connection.ts";
import { createLocalRepo } from "./local.ts";
import { createRemoteRepo } from "./remote.ts";
import { createSupabaseRepo } from "./supabase.ts";
import type { LivingoRepo } from "./types.ts";

function unavailable(mode: BackendMode, message: string): LivingoRepo {
  const fail = async () => {
    throw new Error(message);
  };
  return {
    mode,
    load: fail,
    reload: async () => null,
    subscribe: () => () => undefined,
    createPair: fail,
    joinPair: fail,
    createStreak: fail,
    updateStreak: fail,
    deleteStreak: fail,
    addWord: fail,
    updateWord: fail,
    deleteWord: fail,
    addAttachment: fail,
    deleteAttachment: fail,
    getMedia: async () => fail(),
    review: fail,
    updateMe: fail,
    savePush: fail,
    signOut: async () => undefined,
  };
}

export function createRepo(config: ConnectionConfig): LivingoRepo {
  if (config.mode === "server") return createRemoteRepo(resolveApiUrl(config));
  if (config.mode === "supabase") {
    if (!config.supabaseUrl.trim() || !config.supabaseAnonKey.trim()) {
      return unavailable("supabase", "Add the Supabase project URL and anon key in Connection.");
    }
    return createSupabaseRepo(config.supabaseUrl.trim(), config.supabaseAnonKey.trim());
  }
  return createLocalRepo();
}

export type { LivingoRepo } from "./types.ts";
