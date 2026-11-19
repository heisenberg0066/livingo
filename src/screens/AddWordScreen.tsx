import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { LANGUAGES } from "../../shared/languages.ts";
import { Shell, SpeakerButton } from "../components/Chrome.tsx";
import { Button } from "../components/ui/button.tsx";
import { FieldError, Input, Label } from "../components/ui/field.tsx";
import { useApp } from "../context/AppContext.tsx";
import { useBusy } from "./useBusy.ts";

export function AddWordScreen() {
  const { me, partner, streaks, activeStreak, setActiveStreakId, streak, session, addWord } = useApp();
  const [text, setText] = useState("");
  const [meaning, setMeaning] = useState("");
  const { busy, error, run } = useBusy();
  const navigate = useNavigate();
  if (!me || !session) return null;
  if (!partner) {
    return (
      <Shell nav>
        <div className="px-5 py-8">
          <h1 className="font-display text-4xl">Your friend isn't here yet</h1>
          <Button asChild className="mt-6" size="lg">
            <Link to="/invite">Show the code</Link>
          </Button>
        </div>
      </Shell>
    );
  }
  if (!activeStreak || streaks.length === 0) {
    return (
      <Shell nav>
        <div className="px-5 py-8">
          <h1 className="font-display text-4xl">Start a streak first</h1>
          <Button asChild className="mt-6" size="lg">
            <Link to="/streaks/new">Choose a daily limit</Link>
          </Button>
        </div>
      </Shell>
    );
  }
  const language = LANGUAGES[me.teaches];
  const added = streak?.myCount ?? 0;
  const limit = activeStreak.dailyLimit;

  return (
    <Shell nav>
      <form
        className="px-5 py-6"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await addWord({ streakId: activeStreak.id, text, meaning });
            navigate("/");
          });
        }}
      >
        <Link to="/" className="text-sm font-extrabold text-muted">
          Home
        </Link>
        <p className="mt-3 text-sm font-extrabold text-muted">
          {language.flag} You're teaching {language.name}
        </p>
        <h1 className="font-display text-4xl">Today's word</h1>
        <p className="mt-2 font-bold text-ink/70">
          {added >= limit
            ? `You've already added ${limit}. Another word still becomes a card.`
            : `${added} of ${limit} for today. ${partner.displayName} is learning this from you.`}
        </p>
        {streaks.length > 1 ? (
          <label className="mt-4 block text-sm font-extrabold">
            Streak
            <select
              className="mt-2 h-12 w-full rounded-2xl border-2 border-line bg-white px-3 font-bold"
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
        <div className="mt-5">
          <Label htmlFor="word">Word in {language.nativeName}</Label>
          <div className="flex gap-2">
            <Input id="word" value={text} placeholder={me.teaches === "sv" ? "hej" : "bonjour"} onChange={(event) => setText(event.target.value)} />
            <SpeakerButton text={text} language={me.teaches} />
          </div>
        </div>
        <div className="mt-4">
          <Label htmlFor="meaning">English meaning</Label>
          <Input
            id="meaning"
            value={meaning}
            placeholder="hello"
            onChange={(event) => setMeaning(event.target.value)}
          />
        </div>
        <Button className="mt-6 w-full" size="lg" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save card"}
        </Button>
        <FieldError>{error}</FieldError>
      </form>
    </Shell>
  );
}
