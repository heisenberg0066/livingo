import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shell } from "../components/Chrome.tsx";
import { Button } from "../components/ui/button.tsx";
import { FieldError, Input, Label } from "../components/ui/field.tsx";
import { useApp } from "../context/AppContext.tsx";
import { useBusy } from "./useBusy.ts";

export function NewStreakScreen() {
  const { me, partner, createStreak } = useApp();
  const [name, setName] = useState("Daily words");
  const [limit, setLimit] = useState(1);
  const [starter, setStarter] = useState<"me" | "partner">("me");
  const { busy, error, run } = useBusy();
  const navigate = useNavigate();

  return (
    <Shell nav>
      <form
        className="px-5 py-6"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await createStreak({
              name,
              dailyLimit: limit,
              starterId: starter === "partner" && partner ? partner.id : me?.id,
            });
            navigate("/");
          });
        }}
      >
        <Link to="/" className="text-sm font-extrabold text-muted">
          Home
        </Link>
        <h1 className="mt-3 font-display text-4xl">New streak</h1>
        <p className="mt-2 font-bold text-ink/70">
          One of you posts, the other replies, and the next day you swap. {partner ? `${partner.displayName} will see it right away.` : "Your friend needs to join first."}
        </p>
        <div className="mt-5">
          <Label htmlFor="streak-name">Name</Label>
          <Input id="streak-name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
        </div>
        <p className="mb-2 mt-5 text-sm font-extrabold">Who posts on the first day?</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setStarter("me")} className={`rounded-3xl p-4 text-left font-extrabold ${starter === "me" ? "bg-leaf text-white" : "bg-white"}`}>
            I post first
          </button>
          <button type="button" onClick={() => setStarter("partner")} className={`rounded-3xl p-4 text-left font-extrabold ${starter === "partner" ? "bg-leaf text-white" : "bg-white"}`}>
            {partner ? partner.displayName : "My friend"} posts first
          </button>
        </div>
        <p className="mb-2 mt-5 text-sm font-extrabold">Words posted each turn</p>
        <div className="flex items-center gap-3">
          <Button type="button" variant="white" size="icon" aria-label="Fewer words" onClick={() => setLimit((value) => Math.max(1, value - 1))}>
            <Minus />
          </Button>
          <p className="w-16 text-center font-display text-5xl">{limit}</p>
          <Button type="button" variant="white" size="icon" aria-label="More words" onClick={() => setLimit((value) => Math.min(5, value + 1))}>
            <Plus />
          </Button>
        </div>
        <Button className="mt-6 w-full" size="lg" type="submit" disabled={busy || !partner}>
          {busy ? "Starting…" : "Start this streak"}
        </Button>
        <FieldError>{error}</FieldError>
      </form>
    </Shell>
  );
}
