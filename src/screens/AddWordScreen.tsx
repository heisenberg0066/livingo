import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LANGUAGES } from "../../shared/languages.ts";
import { Shell, SpeakerButton } from "../components/Chrome.tsx";
import { VoiceCapture, type VoiceClip } from "../components/VoiceCapture.tsx";
import { Button } from "../components/ui/button.tsx";
import { FieldError, Input, Label, Textarea } from "../components/ui/field.tsx";
import { useApp } from "../context/AppContext.tsx";
import { compressImage } from "../lib/media.ts";
import { useBusy } from "./useBusy.ts";

export function AddWordScreen() {
  const { me, partner, activeStreak, streak, addWord, updateWord, addAttachment } = useApp();
  const [text, setText] = useState("");
  const [meaning, setMeaning] = useState("");
  const [explanation, setExplanation] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [voice, setVoice] = useState<VoiceClip | null>(null);
  const { busy, error, run } = useBusy();
  const navigate = useNavigate();
  if (!me) return null;
  if (!partner || !activeStreak || !streak) {
    return (
      <Shell nav>
        <div className="px-5 py-8">
          <h1 className="font-display text-4xl">Start a streak first</h1>
          <Button asChild className="mt-6" size="lg"><Link to="/streaks/new">Choose who posts first</Link></Button>
        </div>
      </Shell>
    );
  }
  if (streak.turn.kind === "reply" && streak.turn.replyWordIds[0]) {
    return (
      <Shell nav>
        <div className="px-5 py-8">
          <h1 className="font-display text-4xl">{streak.turn.headline}</h1>
          <Button asChild className="mt-6" size="lg"><Link to={`/reply/${streak.turn.replyWordIds[0]}`}>Write the reply</Link></Button>
        </div>
      </Shell>
    );
  }
  if (streak.turn.kind !== "post") {
    return (
      <Shell nav>
        <div className="px-5 py-8">
          <h1 className="font-display text-4xl">{streak.turn.headline}</h1>
          <p className="mt-3 font-bold text-ink/70">{streak.turn.detail}</p>
          <Button asChild className="mt-6" variant="white"><Link to="/">Back home</Link></Button>
        </div>
      </Shell>
    );
  }
  const language = LANGUAGES[me.teaches];
  return (
    <Shell nav>
      <form
        className="px-5 py-6"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const next = await addWord({ streakId: activeStreak.id, text, meaning });
            const created = next?.words
              .filter((word) => word.authorId === me.id && word.text === text.trim())
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
            if (created && explanation.trim()) await updateWord(created.id, { explanation });
            if (created && image) {
              const compressed = await compressImage(image);
              await addAttachment({ wordId: created.id, kind: "image", blob: compressed.blob, mimeType: compressed.mimeType });
            }
            if (created && voice) {
              await addAttachment({ wordId: created.id, kind: "voice", blob: voice.blob, mimeType: voice.mimeType, durationMs: voice.durationMs });
            }
            navigate(created ? `/words/${created.id}` : "/");
          });
        }}
      >
        <Link to="/" className="text-sm font-extrabold text-muted">Home</Link>
        <p className="mt-3 text-sm font-extrabold text-muted">{language.flag} You're posting {language.name}</p>
        <h1 className="font-display text-4xl">Today's word</h1>
        <p className="mt-2 font-bold text-ink/70">{streak.turn.posted} of {streak.turn.limit}. {partner.displayName} will reply in {LANGUAGES[partner.teaches].name}.</p>
        <div className="mt-5">
          <Label htmlFor="word">Word in {language.nativeName}</Label>
          <div className="flex gap-2">
            <Input id="word" value={text} placeholder={me.teaches === "sv" ? "hej" : "bonjour"} onChange={(event) => setText(event.target.value)} />
            <SpeakerButton text={text} language={me.teaches} />
          </div>
        </div>
        <div className="mt-4">
          <Label htmlFor="meaning">English meaning</Label>
          <Input id="meaning" value={meaning} placeholder="hello" onChange={(event) => setMeaning(event.target.value)} />
        </div>
        <div className="mt-4">
          <Label htmlFor="note">Explanation, optional</Label>
          <Textarea id="note" value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="A memory or a tiny grammar hint." />
        </div>
        <div className="mt-4">
          <Label htmlFor="photo">Picture, optional</Label>
          <Input id="photo" type="file" accept="image/*" className="py-3 text-base" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
        </div>
        <div className="mt-4">
          <Label>Voice note, optional</Label>
          <VoiceCapture onChange={setVoice} />
        </div>
        <Button className="mt-6 w-full" size="lg" type="submit" disabled={busy}>{busy ? "Saving…" : "Post card"}</Button>
        <FieldError>{error}</FieldError>
      </form>
    </Shell>
  );
}
