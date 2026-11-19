// Optional. Deploy with `supabase functions deploy notify --no-verify-jwt`
// and a Database Webhook on public.words INSERT that sends header
// x-livingo-webhook: $WEBHOOK_SECRET.
// Secrets: WEBHOOK_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided in the function environment.
// The sync server in this repo already sends these pushes without Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

interface WordRecord {
  id: string;
  pair_id: string;
  author_id: string;
  text: string;
  meaning: string;
}

Deno.serve(async (request) => {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret || request.headers.get("x-livingo-webhook") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }
  const body = await request.json();
  if (body?.type !== "INSERT" || body?.table !== "words") return new Response("ignored");
  const record = body.record as WordRecord;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!url || !key || !publicKey || !privateKey) return new Response("missing secrets", { status: 500 });

  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:livingo@localhost", publicKey, privateKey);
  const admin = createClient(url, key);
  const members = await admin.from("members").select("id, display_name").eq("pair_id", record.pair_id);
  const author = members.data?.find((member) => member.id === record.author_id);
  const others = (members.data ?? []).filter((member) => member.id !== record.author_id).map((member) => member.id);
  if (others.length === 0) return new Response("ok");
  const subs = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").in("member_id", others);
  await Promise.all(
    (subs.data ?? []).map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: "New card on Livingo",
            body: `${author?.display_name ?? "Your friend"} added ${record.text} — ${record.meaning}`,
            url: `/words/${record.id}`,
          }),
        )
        .catch(() => undefined),
    ),
  );
  return new Response("ok");
});
