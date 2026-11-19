import { ImagePlus, Mic, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LANGUAGES } from "../../shared/languages.ts";
import { formatLong } from "../../shared/time.ts";
import type { Attachment } from "../../shared/types.ts";
import { Shell, SpeakerButton } from "../components/Chrome.tsx";
import { Button } from "../components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog.tsx";
import { FieldError, Input, Label, Textarea } from "../components/ui/field.tsx";
import { useApp } from "../context/AppContext.tsx";
import { compressImage, formatDuration } from "../lib/media.ts";
import { useBusy } from "./useBusy.ts";

export function WordScreen() {
  const { wordId = "" } = useParams();
  const { session, me, updateWord, deleteWord, addAttachment, deleteAttachment, repo } = useApp();
  const navigate = useNavigate();
  const word = session?.words.find((item) => item.id === wordId);
  const [explanation, setExplanation] = useState(word?.explanation ?? "");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [text, setText] = useState(word?.text ?? "");
  const [meaning, setMeaning] = useState(word?.meaning ?? "");
  const [recording, setRecording] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useBusy();

  useEffect(() => {
    setExplanation(word?.explanation ?? "");
    setText(word?.text ?? "");
    setMeaning(word?.meaning ?? "");
  }, [word?.id, word?.explanation, word?.text, word?.meaning]);

  if (!session || !me) return null;
  if (!word) {
    return (
      <Shell nav>
        <div className="px-5 py-8">
          <h1 className="font-display text-4xl">That card is gone</h1>
          <Button asChild className="mt-4" variant="white">
            <Link to="/words">Back to words</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const attachments = session.attachments.filter((item) => item.wordId === word.id);
  const photos = attachments.filter((item) => item.kind === "image");
  const voices = attachments.filter((item) => item.kind === "voice");
  const author = session.members.find((member) => member.id === word.authorId)?.displayName ?? "Someone";
  const noteAuthor = session.members.find((member) => member.id === word.explanationAuthorId)?.displayName;
  const info = LANGUAGES[word.language];

  async function onFile(file: File | undefined) {
    if (!file || !word) return;
    const image = await compressImage(file);
    await addAttachment({ wordId: word.id, kind: "image", blob: image.blob, mimeType: image.mimeType });
  }

  async function toggleRecord() {
    if (!word) return;
    if (recorder.current && recorder.current.state === "recording") {
      recorder.current.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const started = Date.now();
    rec.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      setRecording(false);
      void run(() => addAttachment({ wordId: word.id, kind: "voice", blob, mimeType: blob.type || "audio/webm", durationMs: Date.now() - started }));
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
    window.setTimeout(() => {
      if (rec.state === "recording") rec.stop();
    }, 30000);
  }

  return (
    <Shell nav>
      <article className="px-5 py-6">
        <Link to="/words" className="text-sm font-extrabold text-muted">
          All cards
        </Link>
        <p className="mt-3 text-sm font-extrabold text-muted">
          {info.flag} {info.nativeName} · {author} · {formatLong(word.localDate)}
        </p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <h1 className="font-display text-5xl leading-tight">{word.text}</h1>
          <SpeakerButton text={word.text} language={word.language} />
        </div>
        <p className="mt-2 text-xl font-extrabold text-ink/80">{word.meaning}</p>
        <div className="mt-4 flex gap-2">
          <Button type="button" variant="white" size="sm" onClick={() => setEditing(true)}>
            Edit word
          </Button>
          <Button type="button" variant="coral" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>

        <section className="mt-8">
          <h2 className="font-display text-2xl">Explanation</h2>
          <p className="text-sm font-bold text-muted">Either of you can add the story behind the word.</p>
          <Textarea className="mt-3" value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="A note, a memory, a tiny grammar hint." />
          {noteAuthor ? <p className="mt-2 text-xs font-extrabold text-muted">Last edited by {noteAuthor}</p> : null}
          <Button
            className="mt-3"
            type="button"
            variant="sky"
            disabled={busy || explanation === word.explanation}
            onClick={() => void run(() => updateWord(word.id, { explanation }))}
          >
            Save note
          </Button>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl">Pictures</h2>
            <Button type="button" variant="white" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-4 w-4" />
              Add
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void run(() => onFile(file));
              }}
            />
          </div>
          {photos.length === 0 ? <p className="mt-2 font-bold text-muted">No pictures yet.</p> : null}
          <div className="mt-3 grid grid-cols-2 gap-3">
            {photos.map((photo) => (
              <PhotoTile key={photo.id} attachment={photo} repoGet={(id) => repo.getMedia(id)} onOpen={() => setLightbox(photo.mediaId)} onDelete={() => void run(() => deleteAttachment(photo.id))} />
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-2xl">Voice notes</h2>
          <Button
            type="button"
            className="mt-3"
            variant={recording ? "coral" : "gold"}
            onClick={() => void run(toggleRecord).catch(() => undefined)}
          >
            <Mic className="h-5 w-5" />
            {recording ? "Stop recording" : "Record a voice note"}
          </Button>
          <p className="mt-2 text-sm font-bold text-muted">{recording ? "Recording… it stops after 30 seconds." : "Up to 30 seconds."}</p>
          <ul className="mt-3 space-y-3">
            {voices.map((voice) => (
              <VoiceRow key={voice.id} attachment={voice} repoGet={(id) => repo.getMedia(id)} onDelete={() => void run(() => deleteAttachment(voice.id))} />
            ))}
          </ul>
        </section>
        <FieldError>{error}</FieldError>
      </article>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogTitle>Edit word</DialogTitle>
          <DialogDescription>Fix the spelling or the English meaning. The day it belongs to stays the same.</DialogDescription>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await updateWord(word.id, { text, meaning });
                setEditing(false);
              });
            }}
          >
            <div>
              <Label htmlFor="edit-word">Word</Label>
              <Input id="edit-word" value={text} onChange={(event) => setText(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-meaning">Meaning</Label>
              <Input id="edit-meaning" value={meaning} onChange={(event) => setMeaning(event.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              Save changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogTitle>Delete this card?</DialogTitle>
          <DialogDescription>The word, the note, the pictures, and the voice notes all go. If this was today's word, the slot opens again.</DialogDescription>
          <Button
            className="mt-4 w-full"
            variant="coral"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await deleteWord(word.id);
                navigate("/words");
              })
            }
          >
            Delete card
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(lightbox)} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="bg-ink">
          <DialogTitle className="sr-only">Picture</DialogTitle>
          {lightbox ? <MediaImage mediaId={lightbox} repoGet={(id) => repo.getMedia(id)} large /> : null}
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function PhotoTile({
  attachment,
  repoGet,
  onOpen,
  onDelete,
}: {
  attachment: Attachment;
  repoGet: (id: string) => Promise<Blob>;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative">
      <button type="button" onClick={onOpen} className="block w-full overflow-hidden rounded-2xl">
        <MediaImage mediaId={attachment.mediaId} repoGet={repoGet} />
      </button>
      <button type="button" onClick={onDelete} className="absolute right-2 top-2 rounded-full bg-white p-1" aria-label="Delete picture">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function MediaImage({ mediaId, repoGet, large = false }: { mediaId: string; repoGet: (id: string) => Promise<Blob>; large?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let current: string | null = null;
    let cancel = false;
    void repoGet(mediaId).then((blob) => {
      if (cancel) return;
      current = URL.createObjectURL(blob);
      setUrl(current);
    }).catch(() => setUrl(null));
    return () => {
      cancel = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [mediaId, repoGet]);
  if (!url) return <div className={large ? "h-64" : "aspect-square bg-cream"} />;
  return <img src={url} alt="" className={large ? "max-h-[70vh] w-full object-contain" : "aspect-square w-full object-cover"} />;
}

function VoiceRow({
  attachment,
  repoGet,
  onDelete,
}: {
  attachment: Attachment;
  repoGet: (id: string) => Promise<Blob>;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let current: string | null = null;
    let cancel = false;
    void repoGet(attachment.mediaId).then((blob) => {
      if (cancel) return;
      current = URL.createObjectURL(blob);
      setUrl(current);
    }).catch(() => setUrl(null));
    return () => {
      cancel = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [attachment.mediaId, repoGet]);
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-white p-3">
      {url ? <audio controls src={url} preload="none" className="h-10 flex-1" /> : <span className="flex-1 font-bold text-muted">Loading…</span>}
      <span className="text-xs font-extrabold text-muted">{formatDuration(attachment.durationMs)}</span>
      <button type="button" onClick={onDelete} aria-label="Delete voice note">
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
