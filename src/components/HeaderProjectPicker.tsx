import { useState } from "react";
import { Briefcase, Check, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useActiveProject } from "@/lib/project-context";
import { cn } from "@/lib/utils";

export function HeaderProjectPicker() {
  const { activeProjectId, activeProject, setActiveProjectId, projects, loading } = useActiveProject();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="default" size="sm" className="h-8 gap-1.5 max-w-[180px]">
          <Briefcase className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate text-xs">{activeProject ? activeProject.name : "Loyihalar"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(320px,calc(100vw-1rem))] p-2"
      >
        <div className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">
          Loyihani tanlang:
          <div className="text-[11px] font-normal text-muted-foreground/80">
            Keyingi yozuvlar shu loyihaga ketadi.
          </div>
        </div>
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          <button
            type="button"
            onClick={() => { setActiveProjectId(null); setOpen(false); }}
            className={cn(
              "flex w-full items-center justify-between rounded-md border border-border/50 bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
              activeProjectId === null && "bg-muted font-medium",
            )}
          >
            <span className="flex items-center gap-2">
              <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
              Barcha loyihalar
            </span>
            {activeProjectId === null && <Check className="h-4 w-4 text-primary" />}
          </button>

          {loading && projects.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Yuklanmoqda...
            </div>
          )}

          {!loading && projects.length === 0 && (
            <div className="rounded-md border border-dashed border-border/60 px-3 py-3 text-center text-[11px] text-muted-foreground">
              Loyihalar topilmadi. Tizimga kiring yoki yangi loyiha yarating.
              <Link to="/auth" onClick={() => setOpen(false)} className="mt-1 block text-primary hover:underline">
                Kirish →
              </Link>
            </div>
          )}

          {projects.map((p) => {
            const active = activeProjectId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { setActiveProjectId(p.id); setOpen(false); }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border border-border/50 bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                  active && "bg-muted font-medium",
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {p.name}{p.code ? ` (${p.code})` : ""}
                  </span>
                </span>
                {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
