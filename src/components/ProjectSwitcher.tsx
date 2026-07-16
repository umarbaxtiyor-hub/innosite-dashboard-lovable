import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useActiveProject } from "@/lib/project-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function ProjectSwitcher() {
  const { projects, activeProject, setActiveProjectId } = useActiveProject();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 min-w-0 max-w-[180px] sm:min-w-[180px] sm:max-w-none justify-between">
          <span className="flex min-w-0 items-center gap-2 truncate">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{activeProject?.name ?? "Loyiha"}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(280px,calc(100vw-1rem))] p-0" align="end">
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
