import { Check, Plus, Snowflake, X } from "lucide-react";
import { Link } from "react-router-dom";
import { LANGUAGES, greeting } from "../../shared/languages.ts";
import type { DayStatus } from "../../shared/streak.ts";
import { formatLong } from "../../shared/time.ts";
import { Confetti, FlameMark, Shell } from "../components/Chrome.tsx";
import { Button } from "../components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog.tsx";
import { DEMO_CODE } from "../lib/demo.ts";
import { useApp } from "../context/AppContext.tsx";

export function HomeScreen() {
  const app = useApp();
  const { me, partner, session, streak, activeStreak, streaks, celebrate, dismissCelebrate, setActiveStreakId, switchUser } = app;
  if (!me || !session) return null;

  if (!partner) {
    return (
      <Shell nav>
        <div className="px-5 py-8">
          <p className="font-extrabold text-muted">{greeting(me.teaches)}, {me.displayName}</p>
          <h1 className="mt-2 font-display text-4xl">Waiting for your friend</h1>
          <p className="mt-3 font-bold text-ink/70">A streak starts when both of you are in the pair. Send the code, then come back.</p>
          <p className="mt-6 rounded-[28px] bg-white py-6 text-center font-display text-5xl tracking-[0.2em] card-shadow">{session.pair.code}</p>
          <Button asChild className="mt-4 w-full" size="lg">
            <Link to="/invite">Share the code</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  if (!activeStreak || !streak) {
    return (
      <Shell nav>
        <div className="px-5 py-8">
          <h1 className="font-display text-4xl">Set your first streak</h1>
          <p className="mt-3 font-bold text-ink/70">
            {me.displayName} teaches {LANGUAGES[me.teaches].name}. {partner.displayName} teaches {LANGUAGES[partner.teaches].name}. Choose how many words you'll each add every day.
          </p>
          <Button asChild className="mt-6 w-full" size="lg">
            <Link to="/streaks/new">Start a streak</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const recent = session.words
    .filter((word) => word.streakId === activeStreak.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  return (
    <Shell nav>
      {celebrate ? <Confetti /> : null}
      <div className="px-5 py-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="font-extrabold text-muted">{greeting(me.teaches)}, {me.displayName}</p>
            <h1 className="font-display text-3xl">{activeStreak.name}</h1>
          </div>
          {streaks.length > 1 ? (
            <label className="text-sm font-extrabold">
              <span className="sr-only">Streak</span>
              <select
                className="rounded-2xl bg-white px-3 py-2 font-extrabold"
                value={activeStreak.id}
                onChange={(event) => setActiveStreakId(event.target.value)}
              >
                {streaks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </header>

        {session.pair.code === DEMO_CODE ? (
          <div className="mt-4 rounded-3xl bg-gold/30 p-4">
            <p className="font-extrabold">Sample pair</p>
            <p className="text-sm font-bold text-ink/70">Pretend data. Reply to Camille, or switch to her to see the other side.</p>
            <Button className="mt-3" size="sm" variant="white" type="button" onClick={() => void switchUser(partner.id)}>
              Continue as {partner.displayName}
            </Button>
          </div>
        ) : null}

        <section className="mt-4 rounded-[28px] bg-white p-5 card-shadow" aria-label={`${streak.count} day streak`}>
          <div className="flex items-center gap-4">
            <FlameMark className="h-20 w-16" />
            <div>
              <p className="font-display text-6xl leading-none">{streak.count}</p>
              <p className="font-extrabold text-ink/70">day streak</p>
            </div>
          </div>
          <p className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-extrabold ${streak.freeze.available ? "bg-sky/15 text-sky-dark" : "bg-gold/30 text-ink"}`}>
            <Snowflake className="h-4 w-4" />
            {streak.freeze.used && streak.freeze.usedOn ? `Freeze used ${formatLong(streak.freeze.usedOn)}` : "1 freeze ready this week"}
          </p>
          {streak.count === 0 && streak.brokenOn ? (
            <p className="mt-3 font-bold text-coral-dark">The streak paused on {formatLong(streak.brokenOn)}. Seal a new day together to light it again.</p>
          ) : null}
          <ol className="mt-4 grid grid-cols-7 gap-1">
            {streak.days.map((day) => (
              <li key={day.date} className="text-center">
                <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full ${dayTone(day.status)}`} title={day.date}>
                  <DayMark status={day.status} />
                </div>
                <p className="mt-1 text-[11px] font-extrabold text-muted">{day.weekday.slice(0, 1)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={`mt-4 rounded-3xl px-4 py-4 ${streak.turn.kind === "complete" ? "bg-leaf text-white" : "bg-white card-shadow"}`}>
          <p className="font-display text-3xl leading-tight">{streak.turn.headline}</p>
          <p className={`mt-2 text-sm font-bold ${streak.turn.kind === "complete" ? "text-white/90" : "text-ink/70"}`}>{streak.turn.detail}</p>
          <p className={`mt-2 text-xs font-extrabold ${streak.turn.kind === "complete" ? "text-white/80" : "text-muted"}`}>
            {streak.turn.posted}/{streak.turn.limit} posted · {streak.turn.replied} replied · {formatLong(streak.turn.date)}
            {streak.partnerToday !== streak.today ? ` · ${partner.displayName} is on ${formatLong(streak.partnerToday)}` : ""}
          </p>
        </section>
        <p className="mt-3 text-sm font-bold text-ink/60">
          You take turns. One person posts today's word in their language, with the English meaning. The other replies with the equivalent in theirs, and has until the end of their next calendar day.
        </p>
        {streak.turn.kind === "post" ? (
          <Button asChild className="mt-4 w-full" size="lg">
            <Link to="/add">
              <Plus className="h-5 w-5" />
              Post today's word
            </Link>
          </Button>
        ) : null}
        {streak.turn.kind === "reply" && streak.turn.replyWordIds[0] ? (
          <Button asChild className="mt-4 w-full" size="lg">
            <Link to={`/reply/${streak.turn.replyWordIds[0]}`}>Reply in {LANGUAGES[me.teaches].name}</Link>
          </Button>
        ) : null}

        <h2 className="mb-3 mt-8 font-display text-2xl">Latest cards</h2>
        {recent.length === 0 ? (
          <p className="rounded-3xl bg-white p-4 font-bold text-muted">Cards show up here as soon as either of you adds a word.</p>
        ) : (
          <div className="flex min-w-0 max-w-full gap-3 overflow-x-auto pb-2">
            {recent.map((word) => (
              <Link key={word.id} to={`/words/${word.id}`} className="min-w-44 rounded-3xl bg-white p-4 card-shadow">
                <p className="text-sm font-extrabold text-muted">{LANGUAGES[word.language].flag} {LANGUAGES[word.language].nativeName}</p>
                <p className="font-display text-2xl">{word.text}</p>
                <p className="font-bold text-ink/70">{word.meaning}</p>
                {word.replyText ? <p className="font-extrabold text-leaf-dark">{word.replyText}</p> : <p className="text-sm font-bold text-muted">No reply yet</p>}
              </Link>
            ))}
          </div>
        )}
      </div>

      <Dialog open={celebrate} onOpenChange={(open) => !open && dismissCelebrate()}>
        <DialogContent>
          <DialogTitle>You both did it</DialogTitle>
          <DialogDescription>
            {formatLong(streak.today)} is sealed. The streak is {streak.count} {streak.count === 1 ? "day" : "days"}.
          </DialogDescription>
          <div className="mt-4 flex justify-center">
            <FlameMark className="h-24 w-20" />
          </div>
          <Button className="mt-4 w-full" size="lg" type="button" onClick={dismissCelebrate}>
            Keep it going
          </Button>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function dayTone(status: DayStatus): string {
  if (status === "complete") return "bg-leaf text-white";
  if (status === "frozen") return "bg-sky text-white";
  if (status === "failed") return "bg-coral text-white";
  if (status === "pending") return "bg-gold text-ink";
  return "bg-cream text-muted";
}

function DayMark({ status }: { status: DayStatus }) {
  if (status === "complete") return <Check className="h-4 w-4" />;
  if (status === "frozen") return <Snowflake className="h-4 w-4" />;
  if (status === "failed") return <X className="h-4 w-4" />;
  if (status === "pending") return <span className="h-2.5 w-2.5 rounded-full bg-ink" />;
  return <span className="h-2 w-2 rounded-full bg-line" />;
}
