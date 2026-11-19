import { BookOpen, Flame, Sparkles, Users, Volume2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { Language } from "../../shared/types.ts";
import { useApp } from "../context/AppContext.tsx";
import { cn } from "../lib/cn.ts";
import { speak } from "../lib/tts.ts";
import { Button } from "./ui/button.tsx";

const links = [
  { to: "/", label: "Home", icon: Flame },
  { to: "/words", label: "Words", icon: BookOpen },
  { to: "/quiz", label: "Quiz", icon: Sparkles },
  { to: "/pair", label: "Pair", icon: Users },
];

export function Shell({ children, nav = false }: { children: ReactNode; nav?: boolean }) {
  const { toasts } = useApp();
  return (
    <div className="min-h-dvh text-ink">
      <div className="mx-auto grid min-h-dvh w-full max-w-6xl md:grid-cols-[220px_minmax(0,1fr)]">
        {nav ? (
          <aside className="hidden flex-col gap-2 p-6 md:flex">
            <Brand />
            <Nav vertical />
          </aside>
        ) : (
          <div className="hidden md:block" />
        )}
        <div className={cn("mx-auto w-full min-w-0 max-w-xl overflow-x-clip md:max-w-3xl md:px-6 md:py-6", nav && "pb-28 md:pb-10")}>{children}</div>
      </div>
      {nav ? (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-cream/95 px-3 pt-2 backdrop-blur md:hidden" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          <Nav />
        </nav>
      ) : null}
      <div className="pointer-events-none fixed left-1/2 top-4 z-50 flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto rounded-2xl bg-ink px-4 py-3 text-white shadow-lg">
            <p className="font-extrabold">{toast.title}</p>
            {toast.body ? <p className="text-sm font-semibold text-white/80">{toast.body}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="mb-4 flex items-center gap-3 px-2">
      <Mascot className="h-12 w-12" />
      <div>
        <p className="font-display text-2xl leading-none">Livingo</p>
        <p className="text-xs font-extrabold text-muted">Two people. One flame.</p>
      </div>
    </div>
  );
}

function Nav({ vertical = false }: { vertical?: boolean }) {
  return (
    <div className={cn(vertical ? "flex flex-col gap-2" : "flex gap-1")}>
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center justify-center gap-2 rounded-2xl font-extrabold",
                vertical ? "h-12 justify-start px-3 text-base" : "h-14 flex-1 flex-col text-[11px]",
                isActive ? "bg-leaf text-white" : "text-ink/60 hover:bg-white",
              )
            }
          >
            <Icon className="h-5 w-5" />
            {link.label}
          </NavLink>
        );
      })}
    </div>
  );
}

export function Mascot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
      <rect width="80" height="80" rx="24" fill="#2fbe6a" />
      <path d="M40 12c8 12 18 18 18 32a18 18 0 1 1-36 0c0-14 10-20 18-32z" fill="#ffb703" />
      <path d="M40 24c5 8 10 12 10 20a10 10 0 1 1-20 0c0-8 5-12 10-20z" fill="#ff6b6b" />
      <circle cx="34" cy="46" r="2.2" fill="#1c2430" />
      <circle cx="46" cy="46" r="2.2" fill="#1c2430" />
      <path d="M34 52c2.2 2.4 9.6 2.4 12 0" fill="none" stroke="#1c2430" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function FlameMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 80" className={cn("flame-flicker", className)} aria-hidden="true">
      <path d="M32 2c10 16 24 24 24 44a24 24 0 1 1-48 0C8 26 22 18 32 2z" fill="#ffb703" />
      <path d="M32 22c6 10 13 14 13 26a13 13 0 1 1-26 0c0-12 7-16 13-26z" fill="#ff6b6b" />
      <circle cx="26" cy="50" r="2.4" fill="#1c2430" />
      <circle cx="38" cy="50" r="2.4" fill="#1c2430" />
      <path d="M27 57c2 2 8 2 10 0" fill="none" stroke="#1c2430" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SpeakerButton({ text, language, className }: { text: string; language: Language; className?: string }) {
  const [error, setError] = useState<string | null>(null);
  const label = language === "sv" ? "Play Swedish pronunciation" : "Play French pronunciation";
  return (
    <div className={className}>
      <Button
        type="button"
        variant="sky"
        size="icon"
        aria-label={label}
        disabled={!text.trim()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setError(null);
          void speak(text, language).catch((caught: unknown) => {
            setError(caught instanceof Error ? caught.message : "Speech failed.");
          });
        }}
      >
        <Volume2 className="h-5 w-5" />
      </Button>
      {error ? <p className="mt-1 max-w-40 text-xs font-bold text-coral-dark">{error}</p> : null}
    </div>
  );
}

export function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 26 }, (_, index) => ({
        id: index,
        left: Math.random() * 100,
        delay: Math.random() * 0.35,
        color: ["#2fbe6a", "#ffb703", "#2f9eed", "#ff6b6b", "#7c6bf0"][index % 5],
      })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
      {bits.map((bit) => (
        <span
          key={bit.id}
          className="confetti"
          style={{ left: `${bit.left}%`, animationDelay: `${bit.delay}s`, background: bit.color }}
        />
      ))}
    </div>
  );
}

export function LoadingScreen() {
  return (
    <Shell>
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <Mascot className="h-20 w-20" />
        <p className="font-display text-3xl">Livingo</p>
        <p className="font-extrabold text-muted">Warming up the flame…</p>
      </div>
    </Shell>
  );
}
