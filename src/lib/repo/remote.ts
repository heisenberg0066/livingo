import type { PushSubscriptionJSON, ReviewGrade, SessionState } from "../../../shared/types.ts";
import type { AttachmentInput, LivingoRepo } from "./types.ts";

const TOKEN_KEY = "livingo.serverToken";

export function createRemoteRepo(apiUrl: string): LivingoRepo {
  const token = () => localStorage.getItem(TOKEN_KEY);
  const authHeaders = (): Record<string, string> => {
    const value = token();
    return value ? { authorization: `Bearer ${value}` } : {};
  };

  async function request(path: string, init?: RequestInit, json = true): Promise<SessionState> {
    if (!apiUrl) throw new Error("Add the sync server address in Connection.");
    let response: Response;
    try {
      response = await fetch(`${apiUrl}${path}`, {
        ...init,
        headers: { ...(json ? { "content-type": "application/json" } : {}), ...authHeaders(), ...init?.headers },
      });
    } catch {
      throw new Error("Can't reach the sync server. Check the address, and that the server is running.");
    }
    const data = (await response.json().catch(() => ({}))) as { error?: string; token?: string; snapshot?: SessionState };
    if (!response.ok) throw new Error(data.error || "The server couldn't do that.");
    if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
    if (!data.snapshot) throw new Error("The server sent an empty reply.");
    return data.snapshot;
  }

  const reload = async () => {
    if (!token()) return null;
    return request("/api/snapshot", { method: "GET" });
  };

  return {
    mode: "server",
    load: reload,
    reload,
    subscribe(listener) {
      let source: EventSource | null = null;
      let stopped = false;
      const connect = () => {
        const value = token();
        if (!value || stopped || !apiUrl) return;
        source?.close();
        source = new EventSource(`${apiUrl}/api/events?token=${encodeURIComponent(value)}`);
        source.onmessage = () => listener();
        source.onerror = () => {
          source?.close();
          source = null;
          if (!stopped) window.setTimeout(connect, 4000);
        };
      };
      connect();
      const poll = window.setInterval(() => {
        if (token()) listener();
      }, 8000);
      const watch = window.setInterval(() => {
        if (!source && token()) connect();
      }, 2000);
      return () => {
        stopped = true;
        source?.close();
        window.clearInterval(poll);
        window.clearInterval(watch);
      };
    },
    createPair(input) {
      return request("/api/pairs", { method: "POST", body: JSON.stringify(input) });
    },
    joinPair(input) {
      return request("/api/pairs/join", { method: "POST", body: JSON.stringify(input) });
    },
    createStreak(input) {
      return request("/api/streaks", { method: "POST", body: JSON.stringify(input) });
    },
    updateStreak(id, patch) {
      return request(`/api/streaks/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    },
    deleteStreak(id) {
      return request(`/api/streaks/${id}`, { method: "DELETE" });
    },
    addWord(input) {
      return request("/api/words", { method: "POST", body: JSON.stringify(input) });
    },
    updateWord(id, patch) {
      return request(`/api/words/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    },
    deleteWord(id) {
      return request(`/api/words/${id}`, { method: "DELETE" });
    },
    async addAttachment(input: AttachmentInput) {
      const form = new FormData();
      form.set("wordId", input.wordId);
      form.set("kind", input.kind);
      if (input.durationMs) form.set("durationMs", String(input.durationMs));
      form.set(
        "file",
        new File([input.blob], input.kind === "image" ? "photo.jpg" : "voice.webm", { type: input.mimeType }),
      );
      return request("/api/attachments", { method: "POST", body: form, headers: authHeaders() }, false);
    },
    deleteAttachment(id) {
      return request(`/api/attachments/${id}`, { method: "DELETE" });
    },
    async getMedia(mediaId) {
      if (!apiUrl) throw new Error("Add the sync server address in Connection.");
      const response = await fetch(`${apiUrl}/api/media/${mediaId}`, { headers: authHeaders() });
      if (!response.ok) throw new Error("That file is missing.");
      return response.blob();
    },
    review(wordId, grade: ReviewGrade) {
      return request("/api/srs", { method: "POST", body: JSON.stringify({ wordId, grade }) });
    },
    updateMe(patch) {
      return request("/api/me", { method: "PATCH", body: JSON.stringify(patch) });
    },
    async savePush(subscription: PushSubscriptionJSON) {
      if (!apiUrl || !token()) throw new Error("Sign in on the sync server before turning push on.");
      const response = await fetch(`${apiUrl}/api/push/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(subscription),
      });
      if (!response.ok) throw new Error("The server didn't store this device for push.");
    },
    async signOut() {
      localStorage.removeItem(TOKEN_KEY);
    },
  };
}

export async function pingServer(apiUrl: string): Promise<void> {
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/health`);
  if (!response.ok) throw new Error("The server answered, but not with a healthy response.");
  const data = (await response.json()) as { ok?: boolean };
  if (!data.ok) throw new Error("That address isn't a Livingo sync server.");
}
