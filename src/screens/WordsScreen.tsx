import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LANGUAGES } from "../../shared/languages.ts";
import type { Language } from "../../shared/types.ts";
import { Shell } from "../components/Chrome.tsx";
import { Input } from "../components/ui/field.tsx";
import { useApp } from "../context/AppContext.tsx";

type Filter = "all" | Language | "mine";

export function WordsScreen() {
  const { session, me } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const words = session?.words ?? [];
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return words
      .filter((word) => {
        if (filter === "mine" && word.authorId !== me?.id) return false;
        if (filter !== "all" && filter !== "mine" && word.language !== filter) return false;
        if (!needle) return true;
        return `${word.text} ${word.meaning} ${word.explanation}`.toLocaleLowerCase().includes(needle);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [words, query, filter, me?.id]);

  return (
    <Shell nav>
      <div className="px-5 py-6">
        <h1 className="font-display text-4xl">All cards</h1>
        <p className="mt-1 font-bold text-muted">{words.length} {words.length === 1 ? "word" : "words"} between you</p>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a word or meaning" className="pl-12" aria-label="Search words" />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {(
            [
              ["all", "All"],
              ["sv", "Swedish"],
              ["fr", "French"],
              ["mine", "Mine"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-full px-4 py-2 text-sm font-extrabold ${filter === id ? "bg-ink text-white" : "bg-white text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {words.length === 0 ? (
          <p className="mt-6 rounded-3xl bg-white p-5 font-bold text-muted">No cards yet. Add today's word and it will wait here for the quiz.</p>
        ) : shown.length === 0 ? (
          <p className="mt-6 rounded-3xl bg-white p-5 font-bold text-muted">Nothing matches “{query.trim()}”.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {shown.map((word) => {
              const author = session?.members.find((member) => member.id === word.authorId)?.displayName ?? "Someone";
              return (
                <li key={word.id}>
                  <Link to={`/words/${word.id}`} className="flex items-center gap-3 rounded-3xl bg-white p-4 card-shadow">
                    <span className="text-3xl" aria-hidden="true">
                      {LANGUAGES[word.language].flag}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-2xl">{word.text}</span>
                      <span className="block truncate font-bold text-muted">{word.meaning}</span>
                      <span className="block text-xs font-extrabold text-ink/40">
                        {author} · {word.localDate}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Shell>
  );
}
