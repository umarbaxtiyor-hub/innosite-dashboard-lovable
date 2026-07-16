import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useActiveProject } from "@/lib/project-context";
import { useCurrentRoles } from "@/hooks/use-current-roles";
import { Bot, Send, Loader2, User, Sparkles, Mic, Square, Volume2, VolumeX } from "lucide-react";

export const Route = createFileRoute("/ai-agent")({
  head: () => ({
    meta: [
      { title: "AI yordamchi — QurilishNazorat" },
      { name: "description", content: "Tizim ma'lumotlari bo'yicha AI yordamchisi: loyiha holati, buyurtmalar, ombor, hisobotlar." },
    ],
  }),
  component: AIAgentPage,
});

type Msg = { role: "user" | "assistant"; content: string; viaVoice?: boolean };

const SUGGESTIONS = [
  "Shu loyiha bo'yicha umumiy holat?",
  "Qaysi materiallar qoldi tugayapti?",
  "Tasdiqlanmagan buyurtmalar ro'yxati",
  "Oxirgi 10 ta nakladnoy",
];

function AIAgentPage() {
  const { activeProjectId, activeProject } = useActiveProject();
  const { hasAny, loading: rolesLoading } = useCurrentRoles();
  const allowed = hasAny(["admin", "pm", "direktor"]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // Jim audio (autoplay-unlock uchun) — 1 sekundlik bo'sh MP3
  const SILENT_MP3 =
    "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID///////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAnGMHkkIAAAAAAAAAAAAAAAAAAAA//sQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxBoDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

  async function speak(text: string, idx: number | null = null) {
    try {
      const audio = audioRef.current ?? new Audio();
      audio.pause();
      audioRef.current = audio;

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mood: "Neutral" }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audio.src = url;
      setSpeaking(true);
      setSpeakingIdx(idx);
      const cleanup = () => { setSpeaking(false); setSpeakingIdx(null); URL.revokeObjectURL(url); };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      await audio.play().catch((err) => {
        console.warn("Autoplay bloklandi:", err);
        cleanup();
      });
    } catch { setSpeaking(false); setSpeakingIdx(null); }
  }

  function stopSpeaking() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setSpeaking(false);
    setSpeakingIdx(null);
  }

  async function send(text: string, viaVoice = false) {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: text.trim(), viaVoice };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: next, project_id: activeProjectId }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${j?.error ?? "Xato yuz berdi"}` }]);
      } else {
        const reply = j.reply ?? "";
        const newIdx = next.length;
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
        if (viaVoice && reply) void speak(reply, newIdx);
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${e?.message ?? "Tarmoq xatosi"}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    try {
      // Gesture ichida audio'ni "unlock" qilamiz, keyin speak() avtomatik o'ynaydi
      if (!audioRef.current) {
        const a = new Audio();
        a.preload = "auto";
        a.src = SILENT_MP3;
        audioRef.current = a;
        a.play().catch(() => {});
      } else {
        audioRef.current.src = SILENT_MP3;
        audioRef.current.play().catch(() => {});
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 800) { toast.error("Juda qisqa yozuv"); return; }
        await transcribeAndSend(blob);
      };
      mediaRecRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Mikrofon ochilmadi");
    }
  }

  function stopRecording() {
    mediaRecRef.current?.stop();
    mediaRecRef.current = null;
    setRecording(false);
  }

  async function transcribeAndSend(blob: Blob) {
    setTranscribing(true);
    try {
      const form = new FormData();
      form.append("audio", blob, "voice.webm");
      form.append("language", "uz");
      const res = await fetch("/api/stt", { method: "POST", body: form });
      const j = await res.json();
      if (!res.ok) { toast.error(j?.error ?? "Tan olinmadi"); return; }
      const text = (j.transcript ?? "").trim();
      if (!text) { toast.error("Ovoz tan olinmadi"); return; }
      await send(text, true);
    } catch (e: any) {
      toast.error(e?.message ?? "STT xato");
    } finally {
      setTranscribing(false);
    }
  }

  if (rolesLoading) return null;
  if (!allowed) {
    return (
      <div className="p-6">
        <PageHeader title="AI yordamchi" subtitle="Ruxsat yo'q" />
        <Card className="mt-4 p-6 text-sm text-muted-foreground">
          ⛔ Bu bo'lim faqat <b>Admin</b>, <b>PM</b> va <b>CEO (Direktor)</b> uchun ochiq.
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col p-2 sm:p-6">
      <PageHeader
        title="AI yordamchi"
        subtitle={activeProject ? activeProject.name : "Loyiha tanlang"}
      />

      <Card className="mt-2 sm:mt-4 flex flex-1 flex-col overflow-hidden border-0 sm:border shadow-none sm:shadow-sm bg-transparent sm:bg-card">
        <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground px-3">
              <div className="rounded-full bg-primary/10 p-3 mb-2">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-sm sm:text-lg font-semibold text-foreground">Savol bering</h2>
              <p className="mt-1 text-xs sm:text-sm max-w-md">
                Loyiha, buyurtma, ombor va xarajatlar bo'yicha.
              </p>
              <div className="mt-4 grid w-full max-w-2xl grid-cols-1 gap-1.5 sm:gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-lg border bg-muted/30 p-2.5 text-left text-xs sm:text-sm hover:bg-muted/60 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
              </div>
              <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-table:my-2">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
                {m.role === "assistant" && m.content && (
                  <button
                    type="button"
                    onClick={() => (speakingIdx === i ? stopSpeaking() : speak(m.content, i))}
                    className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-background/60 transition-colors"
                    title={speakingIdx === i ? "To'xtatish" : "Ovozda eshitish"}
                  >
                    {speakingIdx === i ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                    {speakingIdx === i ? "To'xtatish" : "Eshitish"}
                  </button>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="rounded-2xl bg-muted px-3 py-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="border-t p-2 flex gap-1.5 items-center bg-card"
        >
          {speaking && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={stopSpeaking}
              title="Ovozni to'xtatish"
              aria-label="Ovozni to'xtatish"
            >
              <VolumeX className="h-4 w-4" />
            </Button>
          )}
          <Input
            placeholder={recording ? "🎙 Yozilmoqda..." : transcribing ? "Tan olinmoqda..." : "Savol yozing yoki mikrofon"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading || recording || transcribing}
            className="h-9 text-sm"
          />
          <Button
            type="button"
            variant={recording ? "destructive" : "outline"}
            size="icon"
            onClick={() => (recording ? stopRecording() : startRecording())}
            disabled={loading || transcribing}
            title={recording ? "To'xtatish" : "Ovozli savol"}
            aria-label="Mikrofon"
          >
            {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button type="submit" disabled={loading || !input.trim() || recording || transcribing}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}
