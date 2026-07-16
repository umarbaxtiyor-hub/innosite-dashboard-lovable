import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowDown } from "lucide-react";

const THRESHOLD = 70;
const MAX = 120;

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => { pullRef.current = pull; }, [pull]);
  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  useEffect(() => {
    function getScrollTop() {
      return window.scrollY || document.documentElement.scrollTop || 0;
    }
    function isInOverlay(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      if (!el || !el.closest) return false;
      // Skip when interacting with popovers, dialogs, dropdowns, etc.
      if (el.closest('[data-radix-popper-content-wrapper], [role="dialog"], [data-state="open"][role="menu"], [data-no-pull]')) return true;
      // Skip if any radix popover/dialog is currently open
      if (document.querySelector('[data-radix-popper-content-wrapper]')) return true;
      return false;
    }
    function onTouchStart(e: TouchEvent) {
      if (getScrollTop() > 0 || refreshingRef.current || isInOverlay(e.target)) { startYRef.current = null; return; }
      startYRef.current = e.touches[0].clientY;
    }
    function onTouchMove(e: TouchEvent) {
      if (startYRef.current == null) return;
      if (isInOverlay(e.target)) { startYRef.current = null; setPull(0); return; }
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) { setPull(0); return; }
      setPull(Math.min(MAX, dy * 0.5));
    }

    async function onTouchEnd() {
      if (startYRef.current == null) return;
      const finalPull = pullRef.current;
      startYRef.current = null;
      if (finalPull >= THRESHOLD && !refreshingRef.current) {
        setRefreshing(true);
        setPull(THRESHOLD);
        try {
          await qc.invalidateQueries();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    }
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [qc]);

  const ready = pull >= THRESHOLD;

  return (
    <>
      <div
        className="pointer-events-none fixed left-0 right-0 top-0 z-[200] flex items-start justify-center"
        style={{ height: pull }}
        aria-hidden={pull === 0}
      >
        {pull > 8 && (
          <div className="mt-2 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 shadow ring-1 ring-border backdrop-blur">
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <ArrowDown
                className={`h-4 w-4 transition-transform ${ready ? "rotate-180 text-primary" : "text-muted-foreground"}`}
              />
            )}
          </div>
        )}
      </div>
      <div style={{ transform: pull ? `translateY(${pull}px)` : undefined, transition: pull || refreshing ? "none" : "transform 200ms" }}>
        {children}
      </div>
    </>
  );
}
