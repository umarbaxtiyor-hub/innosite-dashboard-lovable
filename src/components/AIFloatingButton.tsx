import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Loader2, Bot, User, ArrowLeft, Volume2, Square, Sparkles } from "lucide-react";


type Variant = "floating" | "inline" | "navItem" | "sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveProject } from "@/lib/project-context";
import { useCurrentRoles } from "@/hooks/use-current-roles";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { HeroProjectPicker } from "@/components/HeroProjectPicker";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Bu loyiha bo'yicha umumiy holat?",
  "Qaysi materiallar tugayapti?",
  "Tasdiqlanmagan buyurtmalar ro'yxati",
  "Oxirgi 10 ta nakladnoy",
  "Brigada balanslari qanday?",
  "Loyiha byudjeti qanchaga bajarildi?",
];

export function AIFloatingButton({ variant = "floating", collapsed }: { variant?: Variant; collapsed?: boolean } = {}) {
  return <AIFloatingButtonInner variant={variant} collapsed={collapsed} />;
}

function AIFloatingButtonInner({ variant = "floating", collapsed }: { variant?: Variant; collapsed?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { activeProjectId, activeProject } = useActiveProject();
  const { hasAny, loading: rolesLoading } = useCurrentRoles();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("ai-panel-open") === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ai-panel-open", open ? "1" : "0");
  }, [open]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [ttsLoadingIdx, setTtsLoadingIdx] = useState<number | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [ttsTestState, setTtsTestState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [ttsTestMsg, setTtsTestMsg] = useState<string>("");

  async function testTts() {
    setTtsTestState("loading");
    setTtsTestMsg("");
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Salom, bu ovoz testi.", voice: "male" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      if (!blob.size) throw new Error("Bo'sh audio");
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      setTtsTestState("ok");
      setTtsTestMsg(`OK · ${(blob.size / 1024).toFixed(1)} KB audio o'ynatildi`);
    } catch (e) {
      setTtsTestState("error");
      setTtsTestMsg(e instanceof Error ? e.message : "Noma'lum xato");
    }
  }

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  // Sahifa o'zgarganda AI panelni yopamiz
  useEffect(() => {
    setOpen(false);
  }, [path]);




  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  async function speak(text: string, idx: number) {
    if (speakingIdx === idx) {
      audioRef.current?.pause();
      setSpeakingIdx(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setTtsError(null);
    setTtsLoadingIdx(idx);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "male" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "TTS xato");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeakingIdx(null);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setSpeakingIdx(null);
        URL.revokeObjectURL(url);
      };
      setSpeakingIdx(idx);
      await audio.play();
    } catch (e) {
      console.error("TTS error:", e);
      setTtsError(e instanceof Error ? e.message : "Ovoz chiqarishda xato");
      setSpeakingIdx(null);
    } finally {
      setTtsLoadingIdx(null);
    }
  }

  if (path === "/auth") return null;
  if (rolesLoading) return null;
  if (!hasAny(["admin", "pm", "direktor"])) return null;

  async function send(text: string) {
    if (!text.trim() || loading) return;

    // Browser autoplay-block ni chetlab o'tish: gesture ichida darhol
    // jim audio o'ynatib qo'yamiz, keyin src ni almashtiramiz.
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    const audio = new Audio();
    audio.preload = "auto";
    // 1 soniyalik jim MP3 (data URI) — gesture ichida play() chaqiramiz
    audio.src =
      "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID///////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAnGMHkkIAAAAAAAAAAAAAAAAAAAA//sQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxBoDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxDeDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxFSDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxHGDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxI6DwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxKuDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxMiDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxOWDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";
    audioRef.current = audio;
    // Gesture ichida darhol play() chaqiramiz — keyin src o'zgarsa ham audio "unlocked"
    audio.play().catch(() => {});

    const userMsg: Msg = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    let assistantReply = "";
    let assistantIdx = -1;
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: next,
          project_id: activeProjectId,
          client: isMobile ? "mobile" : "web",
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMessages((m) => {
          assistantIdx = m.length;
          return [...m, { role: "assistant", content: `⚠️ ${j?.error ?? "Xato yuz berdi"}` }];
        });
      } else {
        assistantReply = j.reply ?? "";
        setMessages((m) => {
          assistantIdx = m.length;
          return [...m, { role: "assistant", content: assistantReply }];
        });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Tarmoq xatosi";
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${message}` }]);
    } finally {
      setLoading(false);
    }

    // Avtomatik ovoz: javob bo'sh bo'lmasa, oldindan yaratilgan audio obyektga src beramiz
    if (assistantReply && !assistantReply.startsWith("⚠️")) {
      try {
        setTtsError(null);
        const clean = assistantReply
          .replace(/```[\s\S]*?```/g, " ")
          .replace(/[*_#>`|]/g, " ")
          .replace(/\[(.*?)\]\(.*?\)/g, "$1")
          .replace(/\s+/g, " ")
          .trim();
        // Juda uzun bo'lsa, faqat birinchi 1500 belgini o'qiymiz
        const speakText = clean.slice(0, 1500);
        setTtsLoadingIdx(assistantIdx);
        const ttsRes = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: speakText, voice: "male" }),
        });
        if (ttsRes.ok && audioRef.current === audio) {
          const blob = await ttsRes.blob();
          const audioUrl = URL.createObjectURL(blob);
          audio.src = audioUrl;
          audio.onended = () => {
            setSpeakingIdx(null);
            URL.revokeObjectURL(audioUrl);
          };
          audio.onerror = () => {
            setSpeakingIdx(null);
            URL.revokeObjectURL(audioUrl);
          };
          setSpeakingIdx(assistantIdx);
          await audio.play().catch((err) => {
            console.warn("Autoplay bloklandi, qo'lda 'Eshitish' tugmasini bosing:", err);
            setSpeakingIdx(null);
          });
        } else if (!ttsRes.ok) {
          const j = await ttsRes.json().catch(() => ({}));
          setTtsError(j?.error ?? "Ovoz chiqarishda xato");
        }
      } catch (e) {
        console.error("Auto-TTS error:", e);
        setTtsError(e instanceof Error ? e.message : "Ovoz chiqarishda xato");
      } finally {
        setTtsLoadingIdx(null);
      }
    }
  }

  const triggerClass =
    variant === "floating"
      ? "fixed bottom-5 right-5 z-[60] inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#0F172A] shadow-2xl ring-2 ring-[#F97316]/40 transition hover:scale-105 hover:ring-[#F97316]/70"
      : variant === "navItem"
        ? cn(
            "flex flex-1 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-2 text-[11px] font-medium leading-tight transition-all",
            open
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-foreground/70 hover:bg-accent hover:text-foreground",
          )
        : variant === "sidebar"
          ? cn(
              "group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
              open && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
            )
          : "inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0F172A] shadow-md ring-2 ring-[#F97316]/40 transition hover:scale-105 hover:ring-[#F97316]/70";

  const iconSize = variant === "floating" ? "h-6 w-6" : variant === "navItem" ? "h-6 w-6" : variant === "sidebar" ? "h-4 w-4" : "h-5 w-5";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "AI yordamchini yopish" : "AI yordamchi"}
        className={triggerClass}
      >
        {variant === "navItem" ? (
          <>
            <Sparkles className="h-7 w-7 shrink-0" />
            <span className="truncate w-full text-center">AI</span>
          </>
        ) : variant === "sidebar" ? (
          <>
            <Sparkles className={cn(iconSize, "text-[#F97316] shrink-0")} />
            {!collapsed && <span>AI</span>}
          </>
        ) : open ? (
          <Bot className={cn(iconSize, "text-[#F97316]")} />
        ) : (
          <Sparkles className={cn(iconSize, "text-[#F97316]")} />
        )}

      </button>


      {typeof document !== "undefined" && createPortal(
      <div
        className={cn(
          "fixed top-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] md:bottom-0 z-[100] flex flex-col bg-card border-l border-border shadow-2xl",
          "left-0 right-0 md:left-auto md:right-0 md:w-[420px] lg:w-[460px]",
          "transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full md:translate-x-full pointer-events-none",

        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Orqaga"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="rounded-full bg-primary/10 p-1.5">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-none">inochat</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {activeProject ? `${activeProject.name} · butun baza` : "Tizim bo'ylab javob beradi"}
            </div>
          </div>
          <button
            type="button"
            onClick={testTts}
            disabled={ttsTestState === "loading"}
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition",
              ttsTestState === "ok" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
              ttsTestState === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
              ttsTestState === "idle" && "border-border bg-muted/30 text-foreground hover:bg-muted/60",
              ttsTestState === "loading" && "border-border bg-muted/30 text-muted-foreground",
            )}
            title={ttsTestMsg || "Ovoz testi"}
          >
            {ttsTestState === "loading" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Volume2 className="h-3 w-3" />
            )}
            Ovoz test
          </button>
        </div>
        {ttsTestMsg && (
          <div
            className={cn(
              "border-b border-border px-3 py-1.5 text-[11px]",
              ttsTestState === "ok" && "bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
              ttsTestState === "error" && "bg-destructive/5 text-destructive",
            )}
          >
            {ttsTestState === "ok" ? "✓ " : "⚠️ "}
            {ttsTestMsg}
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {!activeProjectId ? (
            <div className="flex h-full flex-col items-center justify-center text-center gap-3 px-4">
              <Bot className="h-8 w-8 text-primary" />
              <p className="text-sm font-semibold text-foreground">Avval loyihani tanlang</p>
              <p className="text-xs text-muted-foreground">AI yordamchi loyiha tanlangandan keyin ishlaydi.</p>
              <div className="mt-2"><HeroProjectPicker /></div>
            </div>
          ) : messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <Bot className="mb-2 h-7 w-7 text-primary" />
              <p className="text-xs font-medium">Loyiha, ombor, BOQ, brigada — istalgan savol.</p>
              <p className="mt-1 text-[10px]">Tizimning butun bazasi bo'yicha javob beraman.</p>
              <div className="mt-4 grid w-full gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-md border border-border bg-muted/30 px-3 py-1.5 text-left text-xs hover:bg-muted/60"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}


          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {m.role === "user" ? (
                  <User className="h-3.5 w-3.5" />
                ) : (
                  <Bot className="h-3.5 w-3.5" />
                )}
              </div>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                <div
                  className="prose prose-sm dark:prose-invert max-w-none break-words
                  prose-p:my-1.5 prose-p:leading-relaxed
                  prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:font-semibold prose-headings:tracking-tight
                  prose-h1:text-base prose-h2:text-sm prose-h2:uppercase prose-h2:tracking-wider prose-h2:text-muted-foreground prose-h3:text-sm
                  prose-strong:font-semibold prose-strong:text-foreground
                  prose-ul:my-1.5 prose-ul:pl-4 prose-li:my-0.5 prose-li:marker:text-primary
                  prose-ol:my-1.5 prose-ol:pl-4
                  prose-hr:my-3 prose-hr:border-border
                  prose-blockquote:my-2 prose-blockquote:border-l-2 prose-blockquote:border-primary prose-blockquote:pl-3 prose-blockquote:italic prose-blockquote:text-foreground/90 prose-blockquote:not-italic
                  prose-code:rounded prose-code:bg-background/60 prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-code:before:content-none prose-code:after:content-none
                  prose-pre:my-2 prose-pre:text-xs prose-pre:rounded-md
                  prose-table:my-2 prose-table:text-xs prose-th:bg-background/60 prose-th:px-2 prose-th:py-1 prose-th:text-left prose-th:font-semibold prose-td:px-2 prose-td:py-1 prose-td:border-t prose-td:border-border/60
                  [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full [&_table]:rounded-md [&_table]:border [&_table]:border-border/60"
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
                {m.role === "assistant" && m.content && !m.content.startsWith("⚠️") && (
                  <button
                    type="button"
                    onClick={() => speak(m.content, i)}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-background/60 hover:text-foreground"
                    aria-label={speakingIdx === i ? "To'xtatish" : "Ovozda eshitish"}
                  >
                    {ttsLoadingIdx === i ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : speakingIdx === i ? (
                      <Square className="h-3 w-3 fill-current" />
                    ) : (
                      <Volume2 className="h-3 w-3" />
                    )}
                    {speakingIdx === i ? "To'xtatish" : "Eshitish"}
                  </button>
                )}
              </div>
            </div>
          ))}

          {ttsError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {ttsError}
            </div>
          )}

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
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2 border-t border-border p-2 pr-16 pb-[max(env(safe-area-inset-bottom),5rem)]"
        >
          <Input
            placeholder="Savolingizni yozing..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="h-10"
          />
          <Button
            type="submit"
            size="icon"
            className="h-10 w-10 shrink-0"
            disabled={loading || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>,
      document.body,
      )}
    </>
  );
}
