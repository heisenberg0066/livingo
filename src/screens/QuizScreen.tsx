import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LANGUAGES, otherLanguage } from "../../shared/languages.ts";
import { splitQueue } from "../../shared/srs.ts";
import type { Language, Word } from "../../shared/types.ts";
import { Shell, SpeakerButton } from "../components/Chrome.tsx";
import { Button } from "../components/ui/button.tsx";
import { useApp } from "../context/AppContext.tsx";

type Direction = "to-meaning" | "to-other" | "from-other" | "mix";
type LanguageChoice = Language | "both";

const DECOYS = ["house", "bread", "please", "goodbye", "night", "school", "happy", "city", "red", "small", "today", "family"];

interface RoundItem {
  word: Word;
  prompt: string;
  answer: string;
  label: string;
  speak: boolean;
  choices: string[];
}

export function QuizScreen() {
  const { session, me, partner, streak, review } = useApp();
  const learning = partner ? partner.teaches : me ? otherLanguage(me.teaches) : "fr";
  const [language, setLanguage] = useState<LanguageChoice>(learning);
  const [direction, setDirection] = useState<Direction>("to-meaning");
  const [includeLater, setIncludeLater] = useState(false);
  const [round, setRound] = useState<RoundItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const today = streak?.today ?? "";
  const pool = useMemo(() => {
    if (!session || !today) return { due: [] as Word[], later: [] as Word[] };
    return splitQueue(session.words, session.srs, today, language);
  }, [session, today, language]);

  if (!me || !session) return null;

  function begin(source: Word[]) {
    const items = shuffle(source)
      .map((word) => makeQuestion(word, direction, session!.words))
      .filter((item): item is RoundItem => item !== null)
      .slice(0, 8);
    setRound(items);
    setIndex(0);
    setPicked(null);
    setCorrectCount(0);
  }

  const current = round?.[index];
  const finished = round !== null && index >= round.length;

  return (
    <Shell nav>
      <div className="px-5 py-6">
        <h1 className="font-display text-4xl">Quiz</h1>
        <p className="mt-1 font-bold text-muted">
          {partner ? `Practice the ${LANGUAGES[learning].name} ${partner.displayName} is teaching you.` : "Cards come back when they're due."}
        </p>
        {!round || finished ? (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              <Chip active={language === learning} onClick={() => setLanguage(learning)}>
                {LANGUAGES[learning].nativeName}
              </Chip>
              <Chip active={language === me.teaches} onClick={() => setLanguage(me.teaches)}>
                {LANGUAGES[me.teaches].nativeName}
              </Chip>
              <Chip active={language === "both"} onClick={() => setLanguage("both")}>
                Both
              </Chip>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip active={direction === "to-meaning"} onClick={() => setDirection("to-meaning")}>
                Word → English
              </Chip>
              <Chip active={direction === "to-other"} onClick={() => setDirection("to-other")}>
                French → Swedish
              </Chip>
              <Chip active={direction === "from-other"} onClick={() => setDirection("from-other")}>
                Swedish → French
              </Chip>
              <Chip active={direction === "mix"} onClick={() => setDirection("mix")}>
                Mix
              </Chip>
            </div>
          </div>
        ) : null}

        {finished ? (
          <section className="mt-6 rounded-[28px] bg-white p-6 card-shadow">
            <p className="font-display text-5xl">{correctCount}/{round.length}</p>
            <p className="mt-2 font-bold text-ink/70">
              {correctCount === round.length ? "Clean round." : "Misses come back tomorrow. The ones you knew wait a little longer."}
            </p>
            <Button className="mt-4 w-full" size="lg" type="button" onClick={() => setRound(null)}>
              Another round
            </Button>
          </section>
        ) : current ? (
          <Question
            item={current}
            step={index + 1}
            total={round.length}
            picked={picked}
            onPick={async (choice) => {
              if (picked) return;
              const ok = choice.trim().toLocaleLowerCase() === current.answer.trim().toLocaleLowerCase();
              setPicked(choice);
              if (ok) setCorrectCount((count) => count + 1);
              try {
                await review(current.word.id, ok ? "good" : "again");
              } catch {
                // The answer still stands if the save fails; the next sync can retry.
              }
            }}
            onNext={() => {
              setPicked(null);
              setIndex((value) => value + 1);
            }}
          />
        ) : pool.due.length === 0 && pool.later.length === 0 ? (
          <div className="mt-6 rounded-[28px] bg-white p-5">
            <p className="font-display text-2xl">No cards in this pile yet</p>
            <p className="mt-2 font-bold text-muted">Add a few words first. They'll come back here.</p>
            <Button asChild className="mt-4" variant="white">
              <Link to="/add">Add a word</Link>
            </Button>
          </div>
        ) : pool.due.length === 0 && !includeLater ? (
          <div className="mt-6 rounded-[28px] bg-white p-5">
            <p className="font-display text-2xl">Nothing due today</p>
            <p className="mt-2 font-bold text-muted">You're caught up. You can still practice the cards that are scheduled later.</p>
            <Button className="mt-4" type="button" onClick={() => { setIncludeLater(true); begin(pool.later); }}>
              Practice anyway
            </Button>
          </div>
        ) : (
          <Button className="mt-6 w-full" size="lg" type="button" onClick={() => begin(pool.due.length ? pool.due : pool.later)}>
            Start · {Math.min(8, (pool.due.length ? pool.due : pool.later).length)} cards
          </Button>
        )}
      </div>
    </Shell>
  );
}

function Question({
  item,
  step,
  total,
  picked,
  onPick,
  onNext,
}: {
  item: RoundItem;
  step: number;
  total: number;
  picked: string | null;
  onPick: (choice: string) => void;
  onNext: () => void;
}) {
  const correct = item.answer;
  return (
    <section className="mt-6">
      <p className="text-sm font-extrabold text-muted">
        {step} of {total} · {item.label}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-[28px] bg-white p-5 card-shadow">
        <div>
          <p className="text-sm font-extrabold text-muted">{LANGUAGES[item.word.language].flag}</p>
          <p className="font-display text-4xl leading-tight">{item.prompt}</p>
        </div>
        {item.speak ? <SpeakerButton text={item.word.text} language={item.word.language} /> : null}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {item.choices.map((choice) => {
          const chosen = picked === choice;
          const isCorrect = choice.trim().toLocaleLowerCase() === correct.trim().toLocaleLowerCase();
          let variant: "white" | "primary" | "coral" = "white";
          if (picked && isCorrect) variant = "primary";
          else if (chosen && !isCorrect) variant = "coral";
          return (
            <Button key={choice} type="button" variant={variant} size="lg" disabled={Boolean(picked)} onClick={() => onPick(choice)}>
              {choice}
            </Button>
          );
        })}
      </div>
      {picked ? (
        <div className="mt-4">
          <SpeakerButton text={item.word.text} language={item.word.language} />
          <Button className="mt-3 w-full" size="lg" type="button" onClick={onNext}>
            Continue
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-4 py-2 text-sm font-extrabold ${active ? "bg-ink text-white" : "bg-white"}`}>
      {children}
    </button>
  );
}

function side(word: Word, language: Language): string {
  if (word.language === language) return word.text;
  if (word.replyLanguage === language) return word.replyText;
  return "";
}

function makeQuestion(word: Word, direction: Direction, words: Word[]): RoundItem | null {
  const french = side(word, "fr");
  const swedish = side(word, "sv");
  const options: Array<"to-meaning" | "to-other" | "from-other"> =
    direction === "mix" ? ["to-meaning", "to-other", "from-other"] : [direction];
  const usable = options.filter((way) => {
    if (way === "to-meaning") return Boolean(word.text && word.meaning);
    if (way === "to-other") return Boolean(french && swedish);
    return Boolean(french && swedish);
  });
  const way = usable[Math.floor(Math.random() * usable.length)];
  if (!way) return null;
  const prompt = way === "to-meaning" ? word.text : way === "to-other" ? french : swedish;
  const answer = way === "to-meaning" ? word.meaning : way === "to-other" ? swedish : french;
  const pool = words
    .filter((item) => item.id !== word.id)
    .map((item) => (way === "to-meaning" ? item.meaning : way === "to-other" ? side(item, "sv") : side(item, "fr")))
    .filter(Boolean);
  return {
    word,
    prompt,
    answer,
    label: way === "to-meaning" ? "What does this mean?" : way === "to-other" ? "How do you say it in Swedish?" : "How do you say it in French?",
    speak: way !== "from-other",
    choices: choicesFor(answer, [...pool, ...DECOYS]),
  };
}

function choicesFor(correct: string, pool: string[]): string[] {
  const seen = new Set([correct.trim().toLocaleLowerCase()]);
  const options = [correct];
  for (const candidate of shuffle(pool)) {
    const key = candidate.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    options.push(candidate);
    if (options.length === 4) break;
  }
  return shuffle(options);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = copy[index]!;
    copy[index] = copy[swap]!;
    copy[swap] = current;
  }
  return copy;
}
