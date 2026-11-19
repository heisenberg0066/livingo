import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { Store } from "./store.ts";

const dirs: string[] = [];

async function boot() {
  const dir = await mkdtemp(join(tmpdir(), "livingo-"));
  dirs.push(dir);
  const store = new Store(dir);
  await store.init();
  const { app } = createApp({ store, vapidPublicKey: "test-public" });
  return app;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("sync server", () => {
  it("shares words, media, and a rejection for a third person", async () => {
    const app = await boot();
    const created = await app.request("/api/pairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Ammar", teaches: "sv", timezone: "Europe/Stockholm" }),
    });
    expect(created.status).toBe(200);
    const first = (await created.json()) as { token: string; snapshot: { pair: { code: string } } };

    const joined = await app.request("/api/pairs/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: first.snapshot.pair.code,
        displayName: "Camille",
        teaches: "fr",
        timezone: "America/Toronto",
      }),
    });
    expect(joined.status).toBe(200);
    const second = (await joined.json()) as { token: string };

    const blocked = await app.request("/api/pairs/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: first.snapshot.pair.code,
        displayName: "Noor",
        teaches: "sv",
        timezone: "Europe/Stockholm",
      }),
    });
    expect(blocked.status).toBe(400);

    const sameLanguage = await app.request("/api/pairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Solo", teaches: "sv", timezone: "UTC" }),
    });
    const solo = (await sameLanguage.json()) as { token: string; snapshot: { pair: { code: string } } };
    const clash = await app.request("/api/pairs/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: solo.snapshot.pair.code, displayName: "Also", teaches: "sv", timezone: "UTC" }),
    });
    expect(clash.status).toBe(400);

    const streakRes = await app.request("/api/streaks", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${first.token}` },
      body: JSON.stringify({ name: "Daily", dailyLimit: 1 }),
    });
    const streakBody = (await streakRes.json()) as { snapshot: { streaks: { id: string }[] } };
    const streakId = streakBody.snapshot.streaks[0]!.id;

    const wordRes = await app.request("/api/words", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${first.token}` },
      body: JSON.stringify({ streakId, text: "hej", meaning: "hello" }),
    });
    expect(wordRes.status).toBe(200);
    const wordBody = (await wordRes.json()) as { snapshot: { words: { id: string; text: string }[] } };
    const wordId = wordBody.snapshot.words[0]!.id;

    const seen = await app.request("/api/snapshot", { headers: { authorization: `Bearer ${second.token}` } });
    const seenBody = (await seen.json()) as { snapshot: { words: { text: string }[] } };
    expect(seenBody.snapshot.words.map((word) => word.text)).toEqual(["hej"]);

    const form = new FormData();
    form.set("wordId", wordId);
    form.set("kind", "image");
    form.set("file", new File([Uint8Array.from([137, 80, 78, 71])], "pic.png", { type: "image/png" }));
    const uploaded = await app.request("/api/attachments", {
      method: "POST",
      headers: { authorization: `Bearer ${second.token}` },
      body: form,
    });
    expect(uploaded.status).toBe(200);
    const uploadedBody = (await uploaded.json()) as { snapshot: { attachments: { mediaId: string }[] } };
    const mediaId = uploadedBody.snapshot.attachments[0]!.mediaId;

    const media = await app.request(`/api/media/${mediaId}`, { headers: { authorization: `Bearer ${first.token}` } });
    expect(media.status).toBe(200);
    expect(media.headers.get("content-type")).toBe("image/png");

    const removed = await app.request(`/api/words/${wordId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${first.token}` },
    });
    const removedBody = (await removed.json()) as { snapshot: { words: unknown[]; attachments: unknown[] } };
    expect(removedBody.snapshot.words).toHaveLength(0);
    expect(removedBody.snapshot.attachments).toHaveLength(0);
  });
});
