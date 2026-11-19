import { Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button.tsx";

export interface VoiceClip {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export function VoiceCapture({ onChange }: { onChange: (clip: VoiceClip | null) => void }) {
  const [recording, setRecording] = useState(false);
  const [clip, setClip] = useState<VoiceClip | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function toggle() {
    if (recorder.current && recorder.current.state === "recording") {
      recorder.current.stop();
      return;
    }
    setError(null);
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
      const next = { blob, mimeType: blob.type || "audio/webm", durationMs: Date.now() - started };
      setClip(next);
      setRecording(false);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
      onChange(next);
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
    window.setTimeout(() => {
      if (rec.state === "recording") rec.stop();
    }, 30000);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={recording ? "coral" : "gold"}
          onClick={() => {
            void toggle().catch(() => setError("The microphone needs permission."));
          }}
        >
          <Mic className="h-5 w-5" />
          {recording ? "Stop recording" : clip ? "Record again" : "Record a voice note"}
        </Button>
        {clip ? (
          <Button
            type="button"
            variant="white"
            onClick={() => {
              setClip(null);
              setPreview((old) => {
                if (old) URL.revokeObjectURL(old);
                return null;
              });
              onChange(null);
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>
      {preview ? <audio controls src={preview} className="mt-3 w-full" /> : null}
      <p className="mt-2 text-sm font-bold text-muted">{recording ? "Recording… it stops after 30 seconds." : "Optional. Up to 30 seconds. You can still change it on the card."}</p>
      {error ? <p className="mt-1 text-sm font-extrabold text-coral">{error}</p> : null}
    </div>
  );
}
