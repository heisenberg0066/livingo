import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { LANGUAGES, otherLanguage } from "../../shared/languages.ts";
import type { Language } from "../../shared/types.ts";
import { Mascot, Shell } from "../components/Chrome.tsx";
import { Button } from "../components/ui/button.tsx";
import { FieldError, Input, Label } from "../components/ui/field.tsx";
import { connectionLabel, saveConnection, type ConnectionConfig } from "../lib/connection.ts";
import { isNativeApp } from "../lib/native.ts";
import { pingServer } from "../lib/repo/remote.ts";
import { pingSupabase } from "../lib/repo/supabase.ts";
import { useApp } from "../context/AppContext.tsx";
import { deviceZone, useBusy, zones } from "./useBusy.ts";

export function WelcomeScreen() {
  const { me, connection, loadDemo } = useApp();
  const { busy, error, run } = useBusy();
  const navigate = useNavigate();
  if (me) return <Navigate to="/" replace />;
  return (
    <Shell>
      <div className="flex min-h-dvh flex-col px-5 py-8">
        <div className="flex items-center gap-3">
          <Mascot className="h-16 w-16" />
          <div>
            <p className="font-display text-4xl leading-none">Livingo</p>
            <p className="font-extrabold text-muted">Two people. One flame.</p>
          </div>
        </div>
        <h1 className="mt-8 font-display text-4xl leading-tight">Teach each other a word a day.</h1>
        <p className="mt-3 text-lg font-bold leading-snug text-ink/80">
          One of you keeps Swedish coming. The other keeps French coming. The day only counts when you both show up.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Button size="lg" onClick={() => navigate("/start")}>
            Start a pair
          </Button>
          <Button size="lg" variant="sky" onClick={() => navigate("/join")}>
            I have a code
          </Button>
          <Button
            size="lg"
            variant="gold"
            disabled={busy || connection.mode !== "local"}
            onClick={() =>
              void run(async () => {
                await loadDemo();
                navigate("/");
              })
            }
          >
            Try the sample pair
          </Button>
        </div>
        {connection.mode !== "local" ? (
          <p className="mt-3 text-sm font-bold text-muted">The sample pair lives on this device. Switch connection to “This device” to try it.</p>
        ) : null}
        <FieldError>{error}</FieldError>
        <Link to="/connect" className="mt-auto pt-8 text-center text-sm font-extrabold text-ink/70">
          Connection · {connectionLabel(connection)}
        </Link>
      </div>
    </Shell>
  );
}

export function StartScreen() {
  const { createPair, me } = useApp();
  const navigate = useNavigate();
  if (me) return <Navigate to="/" replace />;
  return (
    <PersonForm
      title="Start your pair"
      subtitle="You'll get a short code. Your friend joins with it and teaches the other language."
      submitLabel="Create our code"
      onSubmit={async (input) => {
        await createPair(input);
        navigate("/invite");
      }}
    />
  );
}

export function JoinScreen() {
  const { joinPair, me } = useApp();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  if (me) return <Navigate to="/" replace />;
  return (
    <PersonForm
      title="Join with a code"
      subtitle="Use the code your friend created. Pick the language they don't teach."
      submitLabel="Join the pair"
      code={code}
      onCode={setCode}
      onSubmit={async (input) => {
        await joinPair({ ...input, code });
        navigate("/");
      }}
    />
  );
}

function PersonForm({
  title,
  subtitle,
  submitLabel,
  onSubmit,
  code,
  onCode,
}: {
  title: string;
  subtitle: string;
  submitLabel: string;
  onSubmit: (input: { displayName: string; teaches: Language; timezone: string }) => Promise<void>;
  code?: string;
  onCode?: (value: string) => void;
}) {
  const [name, setName] = useState("");
  const [teaches, setTeaches] = useState<Language>("sv");
  const [timezone, setTimezone] = useState(deviceZone);
  const [showZones, setShowZones] = useState(false);
  const [query, setQuery] = useState("");
  const { busy, error, run } = useBusy();
  const matches = zones()
    .filter((zone) => zone.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  return (
    <Shell>
      <form
        className="px-5 py-8"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => onSubmit({ displayName: name, teaches, timezone }));
        }}
      >
        <Link to="/welcome" className="text-sm font-extrabold text-muted">
          Back
        </Link>
        <h1 className="mt-4 font-display text-4xl">{title}</h1>
        <p className="mt-2 font-bold text-ink/70">{subtitle}</p>
        {onCode ? (
          <div className="mt-6">
            <Label htmlFor="code">Invite code</Label>
            <Input
              id="code"
              value={code}
              autoCapitalize="characters"
              autoCorrect="off"
              placeholder="ABC123"
              onChange={(event) => onCode(event.target.value.toUpperCase())}
              className="text-center font-display text-3xl tracking-[0.3em]"
            />
          </div>
        ) : null}
        <div className="mt-5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" value={name} placeholder="Ammar" maxLength={24} onChange={(event) => setName(event.target.value)} />
        </div>
        <p className="mb-2 mt-5 text-sm font-extrabold">I teach</p>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(LANGUAGES) as Language[]).map((language) => {
            const info = LANGUAGES[language];
            const selected = teaches === language;
            return (
              <button
                key={language}
                type="button"
                onClick={() => setTeaches(language)}
                className={`rounded-3xl border-2 p-4 text-left ${selected ? "border-leaf bg-white" : "border-transparent bg-white/70"}`}
              >
                <span className="text-3xl">{info.flag}</span>
                <span className="mt-2 block font-display text-2xl">{info.nativeName}</span>
                <span className="block text-sm font-bold text-muted">{info.name}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-5 text-sm font-extrabold">
          Your day ends at midnight in{" "}
          <button type="button" className="text-leaf-dark underline" onClick={() => setShowZones((open) => !open)}>
            {timezone}
          </button>
        </p>
        {showZones ? (
          <div className="mt-3 rounded-3xl bg-white p-3">
            <Input value={query} placeholder="Search time zones" onChange={(event) => setQuery(event.target.value)} />
            <div className="mt-2 flex flex-col">
              {matches.map((zone) => (
                <button
                  key={zone}
                  type="button"
                  className="rounded-xl px-3 py-2 text-left font-bold hover:bg-cream"
                  onClick={() => {
                    setTimezone(zone);
                    setShowZones(false);
                  }}
                >
                  {zone}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <Button className="mt-6 w-full" size="lg" type="submit" disabled={busy}>
          {busy ? "One moment…" : submitLabel}
        </Button>
        <FieldError>{error}</FieldError>
        <p className="mt-4 text-sm font-bold text-muted">Meanings are always in English. You'll teach {LANGUAGES[teaches].name}, and learn {LANGUAGES[otherLanguage(teaches)].name}.</p>
      </form>
    </Shell>
  );
}

export function InviteScreen() {
  const { me, session, partner } = useApp();
  const [copied, setCopied] = useState(false);
  if (!me || !session) return <Navigate to="/welcome" replace />;
  const code = session.pair.code;
  return (
    <Shell nav>
      <div className="px-5 py-8">
        <h1 className="font-display text-4xl">{partner ? `${partner.displayName} is in.` : "Share this code"}</h1>
        <p className="mt-2 font-bold text-ink/70">
          {partner
            ? "You're both here. Start a streak and pick how many words you'll each add."
            : "Your friend types this code, picks their name, and teaches the other language."}
        </p>
        <p className="mt-6 rounded-[28px] bg-white py-6 text-center font-display text-5xl tracking-[0.25em] card-shadow">{code}</p>
        <Button
          className="mt-4 w-full"
          size="lg"
          variant="sky"
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
        >
          {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
          {copied ? "Copied" : "Copy code"}
        </Button>
        <Button className="mt-3 w-full" size="lg" type="button" onClick={() => void share(code)}>
          Share
        </Button>
        <Link to={partner ? "/streaks/new" : "/"} className="mt-6 block text-center font-extrabold text-leaf-dark">
          {partner ? "Set the daily limit" : "I'll wait on the home screen"}
        </Link>
      </div>
    </Shell>
  );
}

async function share(code: string) {
  const text = `Join me on Livingo. Code: ${code}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Livingo", text });
      return;
    } catch {
      return;
    }
  }
  await navigator.clipboard.writeText(text);
}

export function ConnectScreen() {
  const { connection, me } = useApp();
  const [draft, setDraft] = useState<ConnectionConfig>(connection);
  const [note, setNote] = useState<string | null>(null);
  const { busy, error, run } = useBusy();

  function choose(mode: ConnectionConfig["mode"]) {
    setDraft({ ...draft, mode });
    setNote(null);
  }

  return (
    <Shell nav={Boolean(me)}>
      <form
        className="px-5 py-8"
        onSubmit={(event) => {
          event.preventDefault();
          saveConnection(draft);
          window.location.assign("/welcome");
        }}
      >
        <Link to={me ? "/pair" : "/welcome"} className="text-sm font-extrabold text-muted">
          Back
        </Link>
        <h1 className="mt-4 font-display text-4xl">Connection</h1>
        <p className="mt-2 font-bold text-ink/70">The sample pair needs nothing. A sync server or Supabase is how two phones share the same streak.</p>
        <div className="mt-5 grid gap-3">
          <ModeCard title="This device" body="Try the app, or share a code between two tabs in the same browser." active={draft.mode === "local"} onClick={() => choose("local")} />
          <ModeCard title="Sync server" body="The free server in this repo. No account. Works on your laptop and on the Android app." active={draft.mode === "server"} onClick={() => choose("server")} />
          <ModeCard title="Supabase" body="Hosted database and file storage on the free tier." active={draft.mode === "supabase"} onClick={() => choose("supabase")} />
        </div>
        {draft.mode === "server" ? (
          <div className="mt-5">
            <Label htmlFor="api">Server address</Label>
            <Input
              id="api"
              value={draft.apiUrl}
              placeholder={isNativeApp() ? "https://livingo.example.com" : "Leave empty to use this site"}
              onChange={(event) => setDraft({ ...draft, apiUrl: event.target.value })}
            />
            <Button
              type="button"
              variant="white"
              className="mt-3"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const url = draft.apiUrl.trim() || window.location.origin;
                  await pingServer(url);
                  setNote(`Reached ${url}`);
                })
              }
            >
              Check connection
            </Button>
          </div>
        ) : null}
        {draft.mode === "supabase" ? (
          <div className="mt-5 space-y-3">
            <div>
              <Label htmlFor="supa">Project URL</Label>
              <Input id="supa" value={draft.supabaseUrl} placeholder="https://xxxx.supabase.co" onChange={(event) => setDraft({ ...draft, supabaseUrl: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="anon">Anon key</Label>
              <Input id="anon" value={draft.supabaseAnonKey} placeholder="eyJ..." onChange={(event) => setDraft({ ...draft, supabaseAnonKey: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="vapid">Web push public key, optional</Label>
              <Input id="vapid" value={draft.vapidPublicKey} placeholder="From the notify function" onChange={(event) => setDraft({ ...draft, vapidPublicKey: event.target.value })} />
            </div>
            <Button
              type="button"
              variant="white"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await pingSupabase(draft.supabaseUrl.trim(), draft.supabaseAnonKey.trim());
                  setNote("Supabase answered.");
                })
              }
            >
              Check connection
            </Button>
          </div>
        ) : null}
        {note ? <p className="mt-3 font-extrabold text-leaf-dark">{note}</p> : null}
        <FieldError>{error}</FieldError>
        <Button className="mt-6 w-full" size="lg" type="submit">
          Save and reload
        </Button>
      </form>
    </Shell>
  );
}

function ModeCard({ title, body, active, onClick }: { title: string; body: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-3xl p-4 text-left ${active ? "bg-leaf text-white" : "bg-white"}`}>
      <span className="block font-display text-2xl">{title}</span>
      <span className={`mt-1 block text-sm font-bold ${active ? "text-white/90" : "text-muted"}`}>{body}</span>
    </button>
  );
}
