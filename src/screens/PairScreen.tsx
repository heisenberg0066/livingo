import { useState } from "react";
import { Link } from "react-router-dom";
import { LANGUAGES } from "../../shared/languages.ts";
import { computeStreak } from "../../shared/streak.ts";
import { Shell } from "../components/Chrome.tsx";
import { Button } from "../components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog.tsx";
import { FieldError, Input, Label } from "../components/ui/field.tsx";
import { useApp } from "../context/AppContext.tsx";
import { appPath, connectionLabel, resolveApiUrl } from "../lib/connection.ts";
import { isIosBrowser, isNativeApp, isStandalone } from "../lib/native.ts";
import { PUSH_FLAG, subscribeWebPush } from "../lib/notify.ts";
import { enableNativeReminders } from "../lib/reminders.ts";
import { useBusy, zones } from "./useBusy.ts";

export function PairScreen() {
  const app = useApp();
  const { me, partner, session, connection, streaks, words, updateMe, updateStreak, deleteStreak, switchUser, signOut, repo } = app;
  const [zoneQuery, setZoneQuery] = useState("");
  const [hideInstall, setHideInstall] = useState(() => localStorage.getItem("livingo.hideInstall") === "1");
  const [dropId, setDropId] = useState<string | null>(null);
  const { busy, error, run } = useBusy();
  if (!me || !session) return null;

  const time = `${String(me.reminderHour).padStart(2, "0")}:${String(me.reminderMinute).padStart(2, "0")}`;
  const zoneMatches = zones().filter((zone) => zone.toLowerCase().includes(zoneQuery.toLowerCase())).slice(0, 6);
  const owes = streaks.some((streak) => {
    const count = words.filter((word) => word.streakId === streak.id && word.authorId === me.id && word.localDate === app.streak?.today).length;
    return count < streak.dailyLimit;
  });

  async function enableNotifications() {
    if (isNativeApp()) {
      await enableNativeReminders(me!, owes);
    }
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission !== "granted" && !isNativeApp()) {
        throw new Error("Notifications are blocked. Allow them for this site, then try again.");
      }
    }
    if (connection.mode === "server") {
      const url = resolveApiUrl(connection);
      const response = await fetch(`${url}/api/vapid-public`);
      if (!response.ok) throw new Error("The sync server didn't share its push key.");
      const data = (await response.json()) as { publicKey?: string };
      if (!data.publicKey) throw new Error("The sync server has no push key yet.");
      const subscription = await subscribeWebPush(data.publicKey);
      await repo.savePush(subscription);
      localStorage.setItem(PUSH_FLAG, "1");
    } else if (connection.mode === "supabase" && connection.vapidPublicKey) {
      const subscription = await subscribeWebPush(connection.vapidPublicKey);
      await repo.savePush(subscription);
      localStorage.setItem(PUSH_FLAG, "1");
    }
  }

  return (
    <Shell nav>
      <div className="px-5 py-6">
        <h1 className="font-display text-4xl">Your pair</h1>
        <p className="mt-1 font-bold text-muted">Code {session.pair.code}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[me, partner].filter(Boolean).map((person) => (
            <article key={person!.id} className="rounded-3xl bg-white p-4 card-shadow">
              <p className="text-3xl">{LANGUAGES[person!.teaches].flag}</p>
              <p className="font-display text-2xl">{person!.displayName}</p>
              <p className="font-bold text-muted">Teaches {LANGUAGES[person!.teaches].name}</p>
              <p className="text-sm font-bold text-ink/50">{person!.timezone}</p>
              {person!.id === me.id ? <p className="mt-1 text-xs font-extrabold text-leaf-dark">This device</p> : null}
            </article>
          ))}
        </div>
        {!partner ? (
          <Button asChild className="mt-4" size="lg">
            <Link to="/invite">Share the invite code</Link>
          </Button>
        ) : null}

        <h2 className="mb-3 mt-8 font-display text-2xl">Streaks</h2>
        <ul className="space-y-3">
          {streaks.map((streak) => {
            const snap = computeStreak({
              startDate: streak.startDate,
              starterId: streak.starterId || streak.createdBy,
              dailyLimit: streak.dailyLimit,
              members: session.members.map((member) => ({
                id: member.id,
                timezone: member.timezone,
                teaches: member.teaches,
                displayName: member.displayName,
              })),
              viewerId: me.id,
              words: words
                .filter((word) => word.streakId === streak.id)
                .map((word) => ({ id: word.id, authorId: word.authorId, localDate: word.localDate, replyText: word.replyText })),
              now: new Date(),
            });
            return (
              <li key={streak.id} className="rounded-3xl bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-display text-2xl">{streak.name}</p>
                    <p className="font-bold text-muted">
                      {snap.count} days · {streak.dailyLimit} {streak.dailyLimit === 1 ? "word" : "words"} per turn · {snap.turn.headline}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="white" onClick={() => app.setActiveStreakId(streak.id)}>
                    Open
                  </Button>
                </div>
                <label className="mt-3 block text-sm font-extrabold">
                  Daily limit
                  <input
                    type="number"
                    min={1}
                    max={5}
                    defaultValue={streak.dailyLimit}
                    className="mt-1 h-12 w-24 rounded-2xl border-2 border-line px-3 font-bold"
                    onBlur={(event) => {
                      const next = Number(event.target.value);
                      if (next !== streak.dailyLimit) void run(() => updateStreak(streak.id, { dailyLimit: next }));
                    }}
                  />
                </label>
                <button type="button" className="mt-2 text-sm font-extrabold text-coral-dark" onClick={() => setDropId(streak.id)}>
                  Delete streak
                </button>
              </li>
            );
          })}
        </ul>
        <Button asChild className="mt-3" variant="sky">
          <Link to="/streaks/new">New streak</Link>
        </Button>

        <h2 className="mt-8 font-display text-2xl">Evening reminder</h2>
        <p className="mt-1 text-sm font-bold text-muted">
          {connection.mode === "server"
            ? "With push on, the server nudges you at this time if today's word is missing, and when your friend adds a card."
            : isNativeApp()
              ? "Android can remind you at this time even if Livingo is closed. You'll also see a banner when your friend adds a card while the app is open."
              : "While Livingo is open you'll get a reminder at this time. Install it, or use the sync server, for a nudge when the app is closed."}
        </p>
        <Label htmlFor="reminder" className="mt-3">
          Time
        </Label>
        <Input
          id="reminder"
          type="time"
          value={time}
          onChange={(event) => {
            const [hour, minute] = event.target.value.split(":").map(Number);
            if (Number.isFinite(hour) && Number.isFinite(minute)) {
              void run(() => updateMe({ reminderHour: hour, reminderMinute: minute }));
            }
          }}
        />
        <Button className="mt-3" type="button" disabled={busy} onClick={() => void run(enableNotifications)}>
          <span>Turn on reminders</span>
        </Button>

        <h2 className="mt-8 font-display text-2xl">Your time zone</h2>
        <p className="text-sm font-bold text-muted">Words you add are stamped with today's date here. Midnight is when your day closes.</p>
        <Input className="mt-3" value={zoneQuery} placeholder={me.timezone} onChange={(event) => setZoneQuery(event.target.value)} aria-label="Search time zones" />
        {zoneQuery ? (
          <div className="mt-2 rounded-2xl bg-white">
            {zoneMatches.map((zone) => (
              <button key={zone} type="button" className="block w-full px-3 py-2 text-left font-bold" onClick={() => void run(async () => { await updateMe({ timezone: zone }); setZoneQuery(""); })}>
                {zone}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 font-extrabold">{me.timezone}</p>
        )}

        {!hideInstall && !isStandalone() && !isNativeApp() ? (
          <section className="mt-8 rounded-3xl bg-white p-4">
            <h2 className="font-display text-2xl">Keep it on your home screen</h2>
            <p className="mt-2 font-bold text-ink/70">
              {isIosBrowser()
                ? "In Safari, tap Share, then Add to Home Screen. On iOS 16.4 or newer, the home-screen icon can receive push once you allow notifications."
                : "Use the browser menu and choose Install, or Add to Home Screen. That's the version that can ping you when the tab is closed."}
            </p>
            <button
              type="button"
              className="mt-3 text-sm font-extrabold text-muted"
              onClick={() => {
                localStorage.setItem("livingo.hideInstall", "1");
                setHideInstall(true);
              }}
            >
              Hide this
            </button>
          </section>
        ) : null}

        <div className="mt-8 flex flex-col gap-3">
          {repo.switchUser && partner ? (
            <Button type="button" variant="gold" onClick={() => void run(() => switchUser(partner.id))}>
              Continue as {partner.displayName}
            </Button>
          ) : null}
          <Link to="/connect" className="text-center font-extrabold text-ink/70">
            Connection · {connectionLabel(connection)}
          </Link>
          <Button
            type="button"
            variant="white"
            onClick={() =>
              void run(async () => {
                await signOut();
                window.location.assign(appPath("/welcome"));
              })
            }
          >
            Sign out of this device
          </Button>
        </div>
        <FieldError>{error}</FieldError>
      </div>

      <Dialog open={Boolean(dropId)} onOpenChange={(open) => !open && setDropId(null)}>
        <DialogContent>
          <DialogTitle>Delete this streak?</DialogTitle>
          <DialogDescription>Its cards go with it. The other streaks stay.</DialogDescription>
          <Button
            className="mt-4 w-full"
            variant="coral"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (dropId) await deleteStreak(dropId);
                setDropId(null);
              })
            }
          >
            Delete streak
          </Button>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
