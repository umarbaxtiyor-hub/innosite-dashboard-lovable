import { useState } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import { useActiveProject } from "@/lib/project-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export function HeroProjectPicker() {
  const { projects, activeProject, setActiveProjectId } = useActiveProject();
  const [open, setOpen] = useState(false);
  const hasActive = !!activeProject;

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex max-w-full items-center gap-2 rounded-full border-2 px-5 py-2 text-sm font-bold transition-all shadow-lg",
            hasActive
              ? "border-white/30 bg-white/15 text-white hover:bg-white/25"
              : "border-[#F97316] bg-[#F97316]/25 text-white animate-slow-blink"
          )}
        >
          <Building2 className="h-5 w-5 shrink-0 opacity-95" />
          <span className="truncate text-base">
            {hasActive ? activeProject!.name : "Loyihani tanlang"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-90" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(280px,calc(100vw-1rem))] p-0" align="center">
        <Command>
          <CommandInput placeholder="Loyiha qidirish..." />
          <CommandList>
            <CommandEmpty>Loyiha topilmadi</CommandEmpty>
            <CommandGroup heading="Loyihalar">
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  onSelect={() => { setActiveProjectId(p.id); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", activeProject?.id === p.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col">
                    <span>{p.name}</span>
                    {p.code && <span className="text-xs text-muted-foreground">{p.code}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
