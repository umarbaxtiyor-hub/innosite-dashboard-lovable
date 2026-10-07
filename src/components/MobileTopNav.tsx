import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardList,
  Calculator,
  FileText,
} from "lucide-react";
import { useCurrentRoles } from "@/hooks/use-current-roles";
import { canAccessPath } from "@/lib/permissions";
import { usePermissionMatrix } from "@/hooks/use-permission-matrix";
import { useActiveProject } from "@/lib/project-context";
import { cn } from "@/lib/utils";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Smeta", url: "/master-zayavka", icon: BookOpen },
  { title: "Jurnal", url: "/master-jadval", icon: ClipboardList },
  { title: "HR", url: "/brigade-balance", icon: Users },
  { title: "Buxgalter", url: "/buxalteriya", icon: Calculator },
] as const;

const PROJECT_LESS = new Set(["/"]);

export function MobileTopNav() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const { roles, loading } = useCurrentRoles();
  const { matrix, loading: matrixLoading } = usePermissionMatrix();
  const { activeProjectId } = useActiveProject();
  const baseVisible = loading || matrixLoading
    ? items
    : items.filter((it) => canAccessPath(it.url, roles, matrix));
  const visibleItems = activeProjectId
    ? baseVisible
    : baseVisible.filter((it) => PROJECT_LESS.has(it.url));

  return (
    <nav className="flex w-full items-stretch gap-0.5 rounded-t-2xl border-t-2 border-[var(--card-frame)] bg-background/95 px-1 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur shadow-[0_-6px_18px_rgba(0,0,0,0.18)]">
      {visibleItems.map((item) => {
        const active = currentPath === item.url;
        return (
          <Link
            key={item.title}
            to={item.url}
            className={cn(
              "flex flex-1 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-2 text-[11px] font-medium leading-tight transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground/70 hover:bg-accent hover:text-foreground",
            )}
          >
            <item.icon className="h-7 w-7 shrink-0" />
            <span className="truncate w-full text-center">{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
