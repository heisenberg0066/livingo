import { generateVAPIDKeys, sendNotification, setVapidDetails } from "web-push";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PushSubscriptionJSON } from "../shared/types.ts";

export interface VapidRecord {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export async function loadVapid(dir: string): Promise<VapidRecord> {
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:livingo@localhost";
  const fromEnv = process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim();
  const record: VapidRecord = fromEnv
    ? {
        publicKey: process.env.VAPID_PUBLIC_KEY!.trim(),
        privateKey: process.env.VAPID_PRIVATE_KEY!.trim(),
        subject,
      }
    : await readOrCreate(dir, subject);
  setVapidDetails(record.subject, record.publicKey, record.privateKey);
  return record;
}

async function readOrCreate(dir: string, subject: string): Promise<VapidRecord> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, "vapid.json");
  try {
    const saved = JSON.parse(await readFile(path, "utf8")) as VapidRecord;
    if (saved.publicKey && saved.privateKey) return { ...saved, subject: saved.subject || subject };
  } catch {
    // First boot mints a keypair. Keep the file: browsers stay subscribed to it.
  }
  const keys = generateVAPIDKeys();
  const record = { publicKey: keys.publicKey, privateKey: keys.privateKey, subject };
  await writeFile(path, JSON.stringify(record, null, 2));
  console.log("Minted VAPID keys at", path);
  return record;
}

export async function sendPush(
  subscription: PushSubscriptionJSON,
  payload: { title: string; body: string; url?: string },
): Promise<"ok" | "gone" | "error"> {
  try {
    await sendNotification(subscription, JSON.stringify(payload));
    return "ok";
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
    if (status === 404 || status === 410) return "gone";
    console.warn("Push failed", status || error);
    return "error";
  }
}
