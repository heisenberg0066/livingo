import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadVapid, sendPush } from "./push.ts";
import { Store } from "./store.ts";

const dataDir = process.env.DATA_DIR || "server/data";
const port = Number(process.env.PORT || 47322);
const hostname = process.env.HOST || "0.0.0.0";
const staticDir =
  process.env.SERVE_STATIC === "0" ? undefined : existsSync("dist/index.html") ? "dist" : undefined;

const store = new Store(dataDir);
await store.init();
const vapid = await loadVapid(dataDir);
const { app, notify } = createApp({ store, vapidPublicKey: vapid.publicKey, staticDir });

store.onPairChange((pairId, event) => {
  notify(pairId);
  if (event.type !== "word-created") return;
  const payload = {
    title: "New card on Livingo",
    body: `${store.displayName(event.word.authorId)} added ${event.word.text} — ${event.word.meaning}`,
    url: `/words/${event.word.id}`,
  };
  for (const sub of store.partnerSubscriptions(pairId, event.word.authorId)) {
    void sendPush(sub, payload).then((result) => {
      if (result === "gone") void store.forgetPushEndpoint(sub.endpoint);
    });
  }
});

async function reminders(): Promise<void> {
  const now = new Date();
  for (const item of store.reminderCandidates(now)) {
    const claimed = await store.claimReminder(item.member.id, item.date);
    if (!claimed) continue;
    for (const sub of item.subs) {
      const result = await sendPush(sub, {
        title: "Livingo",
        body: "Add today's word before midnight or the streak has to spend its freeze.",
        url: "/add",
      });
      if (result === "gone") await store.forgetPushEndpoint(sub.endpoint);
    }
  }
}

setInterval(() => {
  void reminders().catch((error) => console.warn("Reminder tick failed", error));
}, 30_000);
void reminders();

serve({ fetch: app.fetch, port, hostname }, (info) => {
  const where = staticDir ? ` and serving ${staticDir}` : "";
  console.log(`Livingo sync listening on http://${hostname}:${info.port}${where}`);
});
