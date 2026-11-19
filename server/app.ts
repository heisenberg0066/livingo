import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";
import { ZodError } from "zod";
import {
  createPairSchema,
  joinPairSchema,
  profilePatchSchema,
  pushSchema,
  reviewSchema,
  streakInputSchema,
  wordInputSchema,
  wordPatchSchema,
} from "../shared/schemas.ts";
import type { AttachmentKind } from "../shared/types.ts";
import { ApiError, Store } from "./store.ts";

export interface AppOptions {
  store: Store;
  vapidPublicKey: string;
  staticDir?: string;
}

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: ZodError } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, result.error.issues[0]?.message ?? "Check that and try again.");
  }
  return result.data;
}

function bearer(header: string | undefined): string {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, "Sign in again.");
  return match[1]!.trim();
}

export function createApp({ store, vapidPublicKey, staticDir }: AppOptions) {
  const listeners = new Map<string, Set<() => void>>();
  const notify = (pairId: string) => {
    for (const send of listeners.get(pairId) ?? []) send();
  };

  const app = new Hono();
  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: error.message }, error.status as 400);
    }
    console.error(error);
    return c.json({ error: "Something went wrong on the server." }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true, service: "livingo" }));
  app.get("/api/vapid-public", (c) => c.json({ publicKey: vapidPublicKey }));

  app.post("/api/pairs", async (c) => {
    const input = parse(createPairSchema, await c.req.json());
    return c.json(await store.createPair(input));
  });

  app.post("/api/pairs/join", async (c) => {
    const input = parse(joinPairSchema, await c.req.json());
    return c.json(await store.joinPair(input));
  });

  app.get("/api/snapshot", async (c) => {
    return c.json({ snapshot: await store.getSnapshot(bearer(c.req.header("authorization"))) });
  });

  app.post("/api/streaks", async (c) => {
    const input = parse(streakInputSchema, await c.req.json());
    const snapshot = await store.createStreak(bearer(c.req.header("authorization")), input);
    return c.json({ snapshot });
  });

  app.patch("/api/streaks/:id", async (c) => {
    const input = parse(streakInputSchema.partial(), await c.req.json());
    const snapshot = await store.updateStreak(bearer(c.req.header("authorization")), c.req.param("id"), input);
    return c.json({ snapshot });
  });

  app.delete("/api/streaks/:id", async (c) => {
    const snapshot = await store.deleteStreak(bearer(c.req.header("authorization")), c.req.param("id"));
    return c.json({ snapshot });
  });

  app.post("/api/words", async (c) => {
    const input = parse(wordInputSchema, await c.req.json());
    const snapshot = await store.addWord(bearer(c.req.header("authorization")), input);
    return c.json({ snapshot });
  });

  app.patch("/api/words/:id", async (c) => {
    const input = parse(wordPatchSchema, await c.req.json());
    const snapshot = await store.updateWord(bearer(c.req.header("authorization")), c.req.param("id"), input);
    return c.json({ snapshot });
  });

  app.delete("/api/words/:id", async (c) => {
    const snapshot = await store.deleteWord(bearer(c.req.header("authorization")), c.req.param("id"));
    return c.json({ snapshot });
  });

  app.post("/api/attachments", async (c) => {
    const body = await c.req.parseBody();
    const wordId = typeof body.wordId === "string" ? body.wordId : "";
    const kind = body.kind === "voice" ? "voice" : body.kind === "image" ? "image" : "";
    const file = body.file;
    if (!wordId || !kind || !(file instanceof File)) {
      throw new ApiError(400, "Attach a picture or a voice note to a card.");
    }
    const duration = typeof body.durationMs === "string" ? Number(body.durationMs) : null;
    const snapshot = await store.addAttachment(bearer(c.req.header("authorization")), {
      wordId,
      kind: kind as AttachmentKind,
      bytes: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || (kind === "image" ? "image/jpeg" : "audio/webm"),
      durationMs: duration && Number.isFinite(duration) ? duration : null,
    });
    return c.json({ snapshot });
  });

  app.delete("/api/attachments/:id", async (c) => {
    const snapshot = await store.deleteAttachment(bearer(c.req.header("authorization")), c.req.param("id"));
    return c.json({ snapshot });
  });

  app.get("/api/media/:id", async (c) => {
    const media = await store.readMedia(bearer(c.req.header("authorization")), c.req.param("id"));
    if (!media) throw new ApiError(404, "That file is missing.");
    return new Response(media.bytes, {
      headers: {
        "content-type": media.mimeType,
        "cache-control": "private, max-age=86400",
      },
    });
  });

  app.post("/api/srs", async (c) => {
    const input = parse(reviewSchema, await c.req.json());
    const snapshot = await store.review(bearer(c.req.header("authorization")), input.wordId, input.grade);
    return c.json({ snapshot });
  });

  app.patch("/api/me", async (c) => {
    const input = parse(profilePatchSchema, await c.req.json());
    const snapshot = await store.updateMe(bearer(c.req.header("authorization")), input);
    return c.json({ snapshot });
  });

  app.post("/api/push/subscribe", async (c) => {
    const input = parse(pushSchema, await c.req.json());
    await store.savePush(bearer(c.req.header("authorization")), input);
    return c.json({ ok: true });
  });

  app.delete("/api/push/subscribe", async (c) => {
    const input = parse(pushSchema.pick({ endpoint: true }), await c.req.json());
    await store.removePush(bearer(c.req.header("authorization")), input.endpoint);
    return c.json({ ok: true });
  });

  app.get("/api/events", (c) => {
    const token = c.req.query("token") ?? "";
    const member = store.memberFromToken(token);
    if (!member) throw new ApiError(401, "Sign in again.");
    return streamSSE(c, async (stream) => {
      let closed = false;
      const send = () => {
        if (!closed) void stream.writeSSE({ data: JSON.stringify({ type: "changed" }) });
      };
      const set = listeners.get(member.pairId) ?? new Set<() => void>();
      set.add(send);
      listeners.set(member.pairId, set);
      stream.onAbort(() => {
        closed = true;
        set.delete(send);
      });
      await stream.writeSSE({ data: JSON.stringify({ type: "hello" }) });
      while (!closed) {
        await stream.sleep(15000);
        if (!closed) await stream.writeSSE({ event: "ping", data: "1" });
      }
    });
  });

  if (staticDir) {
    app.use("/*", serveStatic({ root: staticDir }));
    app.get("*", async (c) => {
      const path = c.req.path;
      if (path.startsWith("/api")) return c.notFound();
      if (path.includes(".") && !path.endsWith(".html")) return c.notFound();
      const html = await readFile(join(staticDir, "index.html"), "utf8");
      return c.html(html);
    });
  }

  return { app, notify };
}
