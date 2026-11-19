import { addDays, localDate } from "../../shared/time.ts";
import type { Attachment, Pair, PublicMember, SrsCard, Streak, Word } from "../../shared/types.ts";

export const DEMO_CODE = "DEMO42";
export const DEMO_PAIR = "pair-demo";
export const DEMO_AMMAR = "member-ammar";
export const DEMO_CAMILLE = "member-camille";
export const DEMO_STREAK = "streak-daily";
export const DEMO_AMMAR_TOKEN = "demo-token-ammar";
export const DEMO_CAMILLE_TOKEN = "demo-token-camille";

export interface DemoMember extends PublicMember {
  token: string;
}

export interface DemoData {
  pair: Pair;
  members: DemoMember[];
  streaks: Streak[];
  words: Word[];
  attachments: Attachment[];
  srs: SrsCard[];
  media: { id: string; blob: Blob; mimeType: string }[];
  token: string;
}

async function fetchBlob(path: string): Promise<Blob | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

export async function buildDemo(timeZone: string, now = new Date()): Promise<DemoData> {
  const today = localDate(timeZone, now);
  const created = new Date(now.getTime() - 9 * 86400000).toISOString();
  const pair: Pair = { id: DEMO_PAIR, code: DEMO_CODE, createdAt: created };
  const members: DemoMember[] = [
    {
      id: DEMO_AMMAR,
      pairId: DEMO_PAIR,
      displayName: "Ammar",
      teaches: "sv",
      timezone: timeZone,
      reminderHour: 20,
      reminderMinute: 0,
      createdAt: created,
      token: DEMO_AMMAR_TOKEN,
    },
    {
      id: DEMO_CAMILLE,
      pairId: DEMO_PAIR,
      displayName: "Camille",
      teaches: "fr",
      timezone: timeZone,
      reminderHour: 20,
      reminderMinute: 0,
      createdAt: created,
      token: DEMO_CAMILLE_TOKEN,
    },
  ];
  const streaks: Streak[] = [
    {
      id: DEMO_STREAK,
      pairId: DEMO_PAIR,
      name: "Daily words",
      dailyLimit: 1,
      startDate: addDays(today, -6),
      starterId: DEMO_CAMILLE,
      createdBy: DEMO_AMMAR,
      createdAt: created,
    },
  ];

  const script: Array<[number, string, "sv" | "fr", string, string, string]> = [
    [-6, "demo-fromage", "fr", "fromage", "cheese", "ost"],
    [-5, "demo-vatten", "sv", "vatten", "water", "eau"],
    [-4, "demo-chat", "fr", "chat", "cat", "katt"],
    [-2, "demo-soleil", "fr", "soleil", "sun", "sol"],
    [-1, "demo-sv-fika", "sv", "fika", "a coffee break", "pause-café"],
  ];
  const words: Word[] = script.map(([offset, id, language, text, meaning, reply]) => {
    const date = addDays(today, offset);
    const card = word(id, language === "sv" ? DEMO_AMMAR : DEMO_CAMILLE, language, text, meaning, date, `${date}T12:00:00.000Z`);
    card.replyText = reply;
    card.replyLanguage = language === "sv" ? "fr" : "sv";
    card.replyAuthorId = language === "sv" ? DEMO_CAMILLE : DEMO_AMMAR;
    card.repliedAt = `${date}T18:00:00.000Z`;
    return card;
  });
  words.push(word("demo-bonjour", DEMO_CAMILLE, "fr", "bonjour", "hello", today, now.toISOString()));
  const fika = words.find((item) => item.id === "demo-sv-fika");
  if (fika) {
    fika.explanation =
      "A fika is a coffee break with something small and sweet. It is a pause you take on purpose, not a drink next to your laptop.";
    fika.explanationAuthorId = DEMO_AMMAR;
  }

  const media: DemoData["media"] = [];
  const attachments: Attachment[] = [];
  const photo = await fetchBlob("/demo/fika.jpg");
  if (photo && fika) {
    media.push({ id: "demo-media-fika", blob: photo, mimeType: "image/jpeg" });
    attachments.push({
      id: "demo-photo-fika",
      wordId: fika.id,
      pairId: DEMO_PAIR,
      authorId: DEMO_CAMILLE,
      kind: "image",
      mediaId: "demo-media-fika",
      mimeType: "image/jpeg",
      durationMs: null,
      createdAt: now.toISOString(),
    });
  }
  const note = await fetchBlob("/demo/note.wav");
  if (note && fika) {
    media.push({ id: "demo-media-note", blob: note, mimeType: "audio/wav" });
    attachments.push({
      id: "demo-voice-fika",
      wordId: fika.id,
      pairId: DEMO_PAIR,
      authorId: DEMO_CAMILLE,
      kind: "voice",
      mediaId: "demo-media-note",
      mimeType: "audio/wav",
      durationMs: 1800,
      createdAt: now.toISOString(),
    });
  }

  const due = addDays(today, -1);
  const srs: SrsCard[] = words
    .filter((item) => item.authorId === DEMO_CAMILLE)
    .slice(0, 4)
    .map((item) => ({
      id: `${DEMO_AMMAR}:${item.id}`,
      wordId: item.id,
      userId: DEMO_AMMAR,
      ease: 2.5,
      interval: 1,
      due,
      reps: 1,
      lapses: 0,
      lastReviewed: addDays(today, -2),
    }));

  return { pair, members, streaks, words, attachments, srs, media, token: DEMO_AMMAR_TOKEN };
}

function word(
  id: string,
  authorId: string,
  language: "sv" | "fr",
  text: string,
  meaning: string,
  date: string,
  stamp: string,
): Word {
  return {
    id,
    streakId: DEMO_STREAK,
    pairId: DEMO_PAIR,
    authorId,
    language,
    text,
    meaning,
    replyText: "",
    replyLanguage: null,
    replyAuthorId: null,
    repliedAt: null,
    explanation: "",
    explanationAuthorId: null,
    localDate: date,
    createdAt: stamp,
    updatedAt: stamp,
  };
}
