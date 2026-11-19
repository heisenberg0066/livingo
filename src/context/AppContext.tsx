import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { actionPending, computeStreak, type StreakSnapshot } from "../../shared/streak.ts";
import { localDate, localParts } from "../../shared/time.ts";
import type { PublicMember, ReviewGrade, SessionState, Streak, Word } from "../../shared/types.ts";
import { bakedConnection, DEMO_FLAG, loadConnection, saveConnection, type ConnectionConfig } from "../lib/connection.ts";
import { createLocalRepo } from "../lib/repo/local.ts";
import { showLocalNotification, PUSH_FLAG } from "../lib/notify.ts";
import { syncNativeReminder } from "../lib/reminders.ts";
import { createRepo, type LivingoRepo } from "../lib/repo/index.ts";
import type { AttachmentInput, PersonInput } from "../lib/repo/types.ts";
import { playCheer } from "../lib/sound.ts";
import { createId } from "../../shared/ids.ts";

interface Toast {
  id: string;
  title: string;
  body?: string;
}

interface AppValue {
  status: "loading" | "ready" | "error";
  error: string | null;
  connection: ConnectionConfig;
  repo: LivingoRepo;
  session: SessionState | null;
  me: PublicMember | null;
  partner: PublicMember | null;
  streaks: Streak[];
  words: Word[];
  activeStreak: Streak | null;
  setActiveStreakId: (id: string) => void;
  streak: StreakSnapshot | null;
  celebrate: boolean;
  dismissCelebrate: () => void;
  toasts: Toast[];
  pushToast: (title: string, body?: string) => void;
  createPair: (input: PersonInput) => Promise<void>;
  joinPair: (input: PersonInput & { code: string }) => Promise<void>;
  loadDemo: () => Promise<void>;
  createStreak: (input: { name: string; dailyLimit: number; starterId?: string }) => Promise<void>;
  updateStreak: (id: string, patch: { name?: string; dailyLimit?: number }) => Promise<void>;
  deleteStreak: (id: string) => Promise<void>;
  addWord: (input: { streakId: string; text: string; meaning: string }) => Promise<SessionState | undefined>;
  updateWord: (id: string, patch: { text?: string; meaning?: string; explanation?: string; replyText?: string }) => Promise<void>;
  deleteWord: (id: string) => Promise<void>;
  addAttachment: (input: AttachmentInput) => Promise<void>;
  deleteAttachment: (id: string) => Promise<void>;
  review: (wordId: string, grade: ReviewGrade) => Promise<void>;
  updateMe: (patch: {
    displayName?: string;
    timezone?: string;
    reminderHour?: number;
    reminderMinute?: number;
  }) => Promise<void>;
  switchUser: (memberId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppValue | null>(null);
const ACTIVE_KEY = "livingo.activeStreak";

export function AppProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState(loadConnection);
  const repo = useMemo(() => createRepo(connection), [connection]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_KEY) ?? "");
  const [celebrate, setCelebrate] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [clock, setClock] = useState(() => Date.now());

  const pushToast = (title: string, body?: string) => {
    const id = createId();
    setToasts((current) => [...current.slice(-1), { id, title, body }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4600);
  };

  useEffect(() => {
    let stop = () => {};
    let cancel = false;
    setStatus("loading");
    repo
      .load()
      .then((next) => {
        if (cancel) return;
        setSession(next);
        setStatus("ready");
        stop = repo.subscribe(() => {
          void repo.reload().then((fresh) => {
            if (!cancel && fresh) setSession(fresh);
          }).catch(() => undefined);
        });
      })
      .catch((caught: unknown) => {
        if (cancel) return;
        setStatus("error");
        setError(caught instanceof Error ? caught.message : "Couldn't open Livingo.");
      });
    return () => {
      cancel = true;
      stop();
    };
  }, [repo]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const activeStreak = session?.streaks.find((streak) => streak.id === activeId) ?? session?.streaks[0] ?? null;

  useEffect(() => {
    if (activeStreak) localStorage.setItem(ACTIVE_KEY, activeStreak.id);
  }, [activeStreak]);

  const streak = useMemo(() => {
    if (!session || !activeStreak) return null;
    return computeStreak({
      startDate: activeStreak.startDate,
      dailyLimit: activeStreak.dailyLimit,
      starterId: activeStreak.starterId || activeStreak.createdBy,
      members: session.members.map((member) => ({
        id: member.id,
        timezone: member.timezone,
        teaches: member.teaches,
        displayName: member.displayName,
      })),
      viewerId: session.me.id,
      words: session.words
        .filter((word) => word.streakId === activeStreak.id)
        .map((word) => ({ id: word.id, authorId: word.authorId, localDate: word.localDate, replyText: word.replyText })),
      now: new Date(clock),
    });
  }, [session, activeStreak, clock]);

  const seenWords = useRef<Map<string, string> | null>(null);
  const completeWatch = useRef<{ key: string; complete: boolean } | null>(null);

  useEffect(() => {
    if (!session) return;
    const nextSeen = new Map(session.words.map((word) => [word.id, word.replyText]));
    if (seenWords.current) {
      for (const word of session.words) {
        const previousReply = seenWords.current.get(word.id);
        if (previousReply === undefined && word.authorId !== session.me.id) {
          const author = session.members.find((member) => member.id === word.authorId)?.displayName ?? "Your friend";
          pushToast(`${author} posted ${word.text}`, "Your turn to reply.");
          if (document.visibilityState === "hidden" && localStorage.getItem(PUSH_FLAG) !== "1") {
            void showLocalNotification("Livingo", `${author} posted ${word.text}. Your turn to reply.`);
          }
        }
        if (previousReply !== undefined && !previousReply.trim() && word.replyText.trim() && word.replyAuthorId !== session.me.id) {
          const author = session.members.find((member) => member.id === word.replyAuthorId)?.displayName ?? "Your friend";
          pushToast(`${author} replied ${word.replyText}`, word.text);
          if (document.visibilityState === "hidden" && localStorage.getItem(PUSH_FLAG) !== "1") {
            void showLocalNotification("Livingo", `${author} replied ${word.replyText}.`);
          }
        }
      }
    }
    seenWords.current = nextSeen;
  }, [session]);

  useEffect(() => {
    if (!streak || !activeStreak) return;
    const key = `${activeStreak.id}:${streak.today}`;
    const previous = completeWatch.current;
    if (previous && previous.key === key && !previous.complete && streak.todayComplete) {
      const storageKey = `livingo.celebrated.${key}`;
      if (!sessionStorage.getItem(storageKey)) {
        sessionStorage.setItem(storageKey, "1");
        setCelebrate(true);
        playCheer();
      }
    }
    completeWatch.current = { key, complete: streak.todayComplete };
  }, [streak, activeStreak]);

  const owesWords = useMemo(() => {
    if (!session || session.streaks.length === 0) return false;
    const members = session.members.map((member) => ({
      id: member.id,
      timezone: member.timezone,
      teaches: member.teaches,
      displayName: member.displayName,
    }));
    return session.streaks.some((item) => {
      const snap = computeStreak({
        startDate: item.startDate,
        starterId: item.starterId || item.createdBy,
        dailyLimit: item.dailyLimit,
        members,
        viewerId: session.me.id,
        words: session.words
          .filter((word) => word.streakId === item.id)
          .map((word) => ({ id: word.id, authorId: word.authorId, localDate: word.localDate, replyText: word.replyText })),
        now: new Date(clock),
      });
      return actionPending(snap.turn);
    });
  }, [session, clock]);

  useEffect(() => {
    if (!session) return;
    void syncNativeReminder(session.me, owesWords).catch(() => undefined);
  }, [session, owesWords]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      if (localStorage.getItem(PUSH_FLAG) === "1" && connection.mode === "server") return;
      const parts = localParts(session.me.timezone, new Date());
      if (parts.hour !== session.me.reminderHour || parts.minute !== session.me.reminderMinute) return;
      const today = localDate(session.me.timezone, new Date());
      if (!owesWords) return;
      const flag = `livingo.nudged.${session.me.id}.${today}`;
      if (localStorage.getItem(flag)) return;
      if (Notification.permission !== "granted") return;
      localStorage.setItem(flag, "1");
      void showLocalNotification("Livingo", "It's your turn on Livingo before the day closes.");
    }, 20000);
    return () => window.clearInterval(timer);
  }, [session, connection.mode, owesWords]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; title?: string; body?: string };
      if (data?.type === "push") pushToast(data.title || "Livingo", data.body);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  async function apply(action: () => Promise<SessionState | void>) {
    const next = await action();
    if (next) setSession(next);
  }

  const partner = session?.members.find((member) => member.id !== session.me.id) ?? null;
  const value: AppValue = {
    status,
    error,
    connection,
    repo,
    session,
    me: session?.me ?? null,
    partner,
    streaks: session?.streaks ?? [],
    words: session?.words ?? [],
    activeStreak,
    setActiveStreakId: setActiveId,
    streak,
    celebrate,
    dismissCelebrate: () => setCelebrate(false),
    toasts,
    pushToast,
    createPair: (input) => apply(() => repo.createPair(input)),
    joinPair: (input) => apply(() => repo.joinPair(input)),
    loadDemo: async () => {
      const localConfig = { ...bakedConnection(), mode: "local" as const };
      localStorage.setItem(DEMO_FLAG, "1");
      saveConnection(localConfig);
      const local = createLocalRepo();
      if (!local.loadDemo) throw new Error("The sample pair is unavailable.");
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const next = await local.loadDemo(zone);
      setSession(next);
      seenWords.current = null;
      setConnection(localConfig);
    },
    createStreak: async (input) => {
      const next = await repo.createStreak(input);
      setSession(next);
      const newest = [...next.streaks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (newest) setActiveId(newest.id);
    },
    updateStreak: (id, patch) => apply(() => repo.updateStreak(id, patch)),
    deleteStreak: (id) => apply(() => repo.deleteStreak(id)),
    addWord: async (input) => {
      const next = await repo.addWord(input);
      setSession(next);
      return next;
    },
    updateWord: (id, patch) => apply(() => repo.updateWord(id, patch)),
    deleteWord: (id) => apply(() => repo.deleteWord(id)),
    addAttachment: (input) => apply(() => repo.addAttachment(input)),
    deleteAttachment: (id) => apply(() => repo.deleteAttachment(id)),
    review: (wordId, grade) => apply(() => repo.review(wordId, grade)),
    updateMe: (patch) => apply(() => repo.updateMe(patch)),
    switchUser: async (memberId) => {
      if (!repo.switchUser) throw new Error("Switching people is only for the on-device sample.");
      await apply(() => repo.switchUser!(memberId));
    },
    signOut: async () => {
      const wasDemo = localStorage.getItem(DEMO_FLAG) === "1";
      await repo.signOut();
      localStorage.removeItem(DEMO_FLAG);
      if (wasDemo || import.meta.env.PROD) {
        const next = bakedConnection();
        saveConnection(next);
        setConnection(next);
      }
      setSession(null);
      seenWords.current = null;
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("Livingo is still starting.");
  return value;
}
