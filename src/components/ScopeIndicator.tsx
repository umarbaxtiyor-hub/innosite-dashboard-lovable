import { useQuery } from "@tanstack/react-query";
import { Building2, Briefcase, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/lib/project-context";
import { cn } from "@/lib/utils";

export function ScopeIndicator() {
  const { activeProject } = useActiveProject();

  const { data: firm } = useQuery({
    queryKey: ["scope-firm", activeProject?.id],
    enabled: !!activeProject?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: p } = await supabase
        .from("projects")
        .select("firm_id")
        .eq("id", activeProject!.id)
        .maybeSingle();
      const fid = (p as any)?.firm_id;
      if (!fid) return undefined;
      const { data: f } = await supabase.from("firms").select("name").eq("id", fid).maybeSingle();
      return (f as any)?.name as string | undefined;
    },
  });

  const hasScope = !!activeProject;

  return (
    <Link
      to="/"
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
        hasScope
          ? "border-primary/40 bg-primary/5 text-foreground hover:bg-primary/10"
          : "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15",
      )}
      title="Faol firma va loyihani tanlash uchun bosing"
    >
      {hasScope ? (
        <>
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="hidden max-w-[120px] truncate sm:inline">{firm ?? "Firma yo'q"}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <Briefcase className="h-3.5 w-3.5 text-primary" />
          <span className="max-w-[140px] truncate font-medium">{activeProject!.name}</span>
        </>
      ) : (
        <>
          <Briefcase className="h-3.5 w-3.5" />
          <span>Loyiha tanlanmagan — bosing</span>
        </>
      )}
    </Link>
  );
}
