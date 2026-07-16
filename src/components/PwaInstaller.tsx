import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_DAYS = 7;

function isPreviewHost() {
  const h = window.location.hostname;
  return h.includes("id-preview--") || h.includes("lovableproject.com");
}

function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function PwaInstaller() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);

  // Register service worker (production only, not in preview/iframe)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (import.meta.env.DEV) return;
    if (isPreviewHost() || inIframe()) {
      // Clean up any prior registrations in preview/iframe
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  // Install prompt
  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const fresh = Date.now() - dismissedAt > DISMISS_DAYS * 24 * 60 * 60 * 1000;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      if (fresh) setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", () => {
      setVisible(false);
      setDeferred(null);
    });
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  if (!visible || !deferred) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 sm:left-5 sm:translate-x-0">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-2xl">
        <div className="rounded-full bg-primary/10 p-2">
          <Download className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Innosite ilovasini o'rnatish</div>
          <div className="text-[11px] text-muted-foreground">Tezroq ochiladi, offline ham ishlaydi.</div>
        </div>
        <button
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice.catch(() => {});
            setVisible(false);
            setDeferred(null);
          }}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          O'rnatish
        </button>
        <button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
            setVisible(false);
          }}
          aria-label="Yopish"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
