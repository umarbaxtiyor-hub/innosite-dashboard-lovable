import { useActiveProject } from "@/lib/project-context";
import { HeroProjectPicker } from "@/components/HeroProjectPicker";
import { Building2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Loyiha tanlanmagan bo'lsa hech qanday ma'lumot ko'rsatmasdan,
 * loyiha tanlash tugmasini chiqaradi.
 */
export function RequireProject({ children }: { children: ReactNode }) {
  const { activeProjectId, loading } = useActiveProject();
  if (loading) return null;
  if (!activeProjectId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--card-frame)] bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] p-8 text-center shadow-xl max-w-sm w-full">
          <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#F97316]/30 blur-3xl animate-pulse" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-32 w-32 rounded-full bg-[#F97316]/20 blur-3xl animate-pulse" />
          <div className="relative flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F97316]/20 ring-2 ring-[#F97316]/40 animate-pulse">
              <Building2 className="h-7 w-7 text-[#F97316]" />
            </div>
            <h2 className="text-base font-extrabold tracking-tight text-white">Boshlash uchun loyihani tanlang</h2>
            <p className="text-xs text-white/70">Loyiha tanlanmaguncha ma'lumotlar ko'rsatilmaydi</p>
            <div className="mt-2 relative" data-no-pull>
              <span className="pointer-events-none absolute -inset-2 rounded-2xl bg-[#F97316]/40 blur-xl animate-ping" />
              <span className="pointer-events-none absolute -inset-1 rounded-2xl ring-2 ring-[#F97316]/70 animate-pulse" />
              <div className="relative">
                <HeroProjectPicker />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
