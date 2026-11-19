import { LocalNotifications } from "@capacitor/local-notifications";
import { nextReminderInstant } from "../../shared/time.ts";
import type { PublicMember } from "../../shared/types.ts";
import { isNativeApp } from "./native.ts";

export async function syncNativeReminder(me: PublicMember, owesWords: boolean): Promise<void> {
  if (!isNativeApp()) return;
  const current = await LocalNotifications.checkPermissions();
  if (current.display !== "granted") return;
  await LocalNotifications.cancel({ notifications: [{ id: 19 }] });
  const when = nextReminderInstant(me.timezone, me.reminderHour, me.reminderMinute, new Date(), !owesWords);
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 19,
        title: "Livingo",
        body: "Add today's word before midnight.",
        schedule: { at: when, allowWhileIdle: true },
      },
    ],
  });
}

export async function enableNativeReminders(me: PublicMember, owesWords: boolean): Promise<void> {
  if (!isNativeApp()) return;
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") {
    throw new Error("Android notifications are blocked. Allow them in system settings, then try again.");
  }
  await syncNativeReminder(me, owesWords);
}
