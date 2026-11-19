import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LANGUAGES } from "../../shared/languages.ts";
import { Shell, SpeakerButton } from "../components/Chrome.tsx";
import { VoiceCapture, type VoiceClip } from "../components/VoiceCapture.tsx";
import { Button } from "../components/ui/button.tsx";
import { FieldError, Input, Label, Textarea } from "../components/ui/field.tsx";
import { useApp } from "../context/AppContext.tsx";
import { compressImage } from "../lib/media.ts";
import { useBusy } from "./useBusy.ts";

export function ReplyScreen() {
  const { wordId = "" } = useParams();
  const { session, me, updateWord, addAttachment } = useApp();
  const word = session?.words.find((item) => item.id === wordId);
  const [reply, setReply] = useState("");
  const [explanation, setExplanation] = useState(word?.explanation ?? "");
  const [image, setImage] = useState<File | null>(null);
  const [voice, setVoice] = useState<VoiceClip | null>(null);
  const { busy, error, run } = useBusy();
  const navigate = useNavigate();
  if (!me || !session) return null;
  if (!word) {
    return (
      <Shell nav>
        <div className="px-5 py-8">
          <h1 className="font-display text-4xl">That card is gone</h1>
          <Button asChild className="mt-4" variant="white"><Link to="/">Home</Link></Button>
        </div>
      </Shell>
    );
  }
  const poster = session.members.find((member) => member.id === word.authorId);
  return (
    <Shell nav>
      <form
        className="px-5 py-6"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await updateWord(word.id, { replyText: reply, explanation: explanation.trim() ? explanation : undefined });
            if (image) {
              const compressed = await compressImage(image);
              await addAttachment({ wordId: word.id, kind: "image", blob: compressed.blob, mimeType: compressed.mimeType });
            }
            if (voice) {
              await addAttachment({ wordId: word.id, kind: "voice", blob: voice.blob, mimeType: voice.mimeType, durationMs: voice.durationMs });
            }
            navigate(`/words/${word.id}`);
          });
        }}
      >
        <Link to="/" className="text-sm font-extrabold text-muted">Home</Link>
        <p className="mt-3 text-sm font-extrabold text-muted">{LANGUAGES[word.language].flag} {poster?.displayName ?? "Your friend"} posted</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h1 className="font-display text-5xl">{word.text}</h1>
          <SpeakerButton text={word.text} language={word.language} />
        </div>
        <p className="mt-2 text-xl font-extrabold text-ink/70">{word.meaning}</p>
        <div className="mt-6">
          <Label htmlFor="reply">Your {LANGUAGES[me.teaches].name} equivalent</Label>
          <div className="flex gap-2">
            <Input id="reply" value={reply} placeholder={me.teaches === "sv" ? "hej" : "bonjour"} onChange={(event) => setReply(event.target.value)} />
            <SpeakerButton text={reply} language={me.teaches} />
          </div>
        </div>
        <div className="mt-4">
          <Label htmlFor="reply-note">Explanation, optional</Label>
          <Textarea id="reply-note" value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="Why this translation, or a clue." />
        </div>
        <div className="mt-4">
          <Label htmlFor="reply-photo">Picture, optional</Label>
          <Input id="reply-photo" type="file" accept="image/*" className="py-3 text-base" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
        </div>
        <div className="mt-4">
          <Label>Voice note, optional</Label>
          <VoiceCapture onChange={setVoice} />
        </div>
        <Button className="mt-6 w-full" size="lg" type="submit" disabled={busy}>{busy ? "Saving…" : "Save reply"}</Button>
        <FieldError>{error}</FieldError>
      </form>
    </Shell>
  );
}
