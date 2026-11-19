import { addDays, localDate } from "../../shared/time.ts";
import type { Attachment, Pair, PublicMember, SrsCard, Streak, Word } from "../../shared/types.ts";

export const DEMO_CODE = "DEMO42";
export const DEMO_PAIR = "pair-demo";
export const DEMO_AMMAR = "member-ammar";
export const DEMO_CAMILLE = "member-camille";
export const DEMO_STREAK = "streak-daily";
export const DEMO_AMMAR_TOKEN = "demo-token-ammar";
export const DEMO_CAMILLE_TOKEN = "demo-token-camille";

const SWEDISH: [string, string][] = [
  ["hej", "hello"],
  ["tack", "thank you"],
  ["vatten", "water"],
  ["bok", "book"],
  ["katt", "cat"],
  ["sol", "sun"],
  ["vän", "friend"],
  ["fika", "a coffee break"],
];

const FRENCH: [string, string][] = [
  ["bonjour", "hello"],
  ["merci", "thank you"],
  ["eau", "water"],
  ["livre", "book"],
  ["chat", "cat"],
  ["soleil", "sun"],
  ["ami", "friend"],
];

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
  const filledOffsets = [-8, -7, -6, -5, -4, -2, -1];
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
      startDate: addDays(today, -8),
      createdBy: DEMO_AMMAR,
      createdAt: created,
    },
  ];

  const words: Word[] = [];
  filledOffsets.forEach((offset, index) => {
    const date = addDays(today, offset);
    const stamp = `${date}T12:00:00.000Z`;
    const [svText, svMeaning] = SWEDISH[index]!;
    const [frText, frMeaning] = FRENCH[index]!;
    words.push(word(`demo-sv-${index}`, DEMO_AMMAR, "sv", svText, svMeaning, date, stamp));
    words.push(word(`demo-fr-${index}`, DEMO_CAMILLE, "fr", frText, frMeaning, date, stamp));
  });
  const fikaDate = today;
  words.push(word(`demo-sv-fika`, DEMO_AMMAR, "sv", "fika", "a coffee break", fikaDate, now.toISOString()));
  const van = words.find((item) => item.text === "vän");
  if (van) {
    van.explanation = "Friend. Ammar says this when he means it. Kompis is the more casual one.";
    van.explanationAuthorId = DEMO_CAMILLE;
  }
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
    explanation: "",
    explanationAuthorId: null,
    localDate: date,
    createdAt: stamp,
    updatedAt: stamp,
  };
}
