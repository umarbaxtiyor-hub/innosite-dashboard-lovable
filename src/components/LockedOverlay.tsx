import { Lock } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState, type ReactNode } from "react";

export function LockedOverlay({
  locked,
  children,
  message = "Avval loyihani tanlang",
}: {
  locked: boolean;
  children: ReactNode;
  message?: string;
}) {
  // Track previous locked state to drive unlock animation
  const [wasLocked, setWasLocked] = useState(locked);
  const [justUnlocked, setJustUnlocked] = useState(false);

  useEffect(() => {
    if (wasLocked && !locked) {
      setJustUnlocked(true);
      const t = window.setTimeout(() => setJustUnlocked(false), 700);
      return () => window.clearTimeout(t);
    }
    setWasLocked(locked);
  }, [locked, wasLocked]);

  return (
    <div className="relative">
      <div
        aria-hidden={locked}
        className={[
          "transition-all duration-500 ease-out will-change-[filter,opacity,transform]",
          locked
            ? "opacity-40 scale-[0.99] pointer-events-none select-none"
            : justUnlocked
              ? "blur-0 opacity-100 scale-100 animate-fade-in"
              : "blur-0 opacity-100 scale-100",
        ].join(" ")}
      >
        {children}
      </div>

      {locked && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toast.warning(message);
          }}
          className="absolute inset-0 z-10 cursor-not-allowed"
          aria-label={message}
        />
      )}
    </div>
  );
}
