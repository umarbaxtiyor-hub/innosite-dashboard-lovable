import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { seesAllScope } from "@/lib/permissions";

export type Project = { id: string; name: string; code: string | null };

type Ctx = {
  projects: Project[];
  activeProjectId: string | null;
  activeProject: Project | null;
  setActiveProjectId: (id: string | null) => void;
  loading: boolean;
};

const ProjectContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "active_project_id";

// Oxirgi uchtalik tartibi: Admin → BESS PV → Vodakanal. Qolganlari alifbo bo'yicha oldinda.
const TAIL_ORDER = ["admin", "bess", "vodakanal"];
function tailRank(name: string) {
  const n = name.toLowerCase();
  const i = TAIL_ORDER.findIndex((t) => n.includes(t));
  return i === -1 ? -1 : i;
}
export function sortProjects<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ra = tailRank(a.name);
    const rb = tailRank(b.name);
    if (ra === -1 && rb === -1) return a.name.localeCompare(b.name);
    if (ra === -1) return -1;
    if (rb === -1) return 1;
    return ra - rb;
  });
}

export function ActiveProjectProvider({ children }: { children: ReactNode }) {
  const [activeProjectId, setActive] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Sessiya tugagandan keyin tanlovni saqlamaymiz — har yangi kirishda loyiha tanlash kerak.
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) setActive(stored);
    setHydrated(true);
    // Eski localStorage qiymatini tozalaymiz
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      window.setTimeout(() => {
        const nextUserId = session?.user?.id ?? null;
        setUserId((current) => (current === nextUserId ? current : nextUserId));
        if (event === "SIGNED_OUT") {
          setActive(null);
          if (typeof window !== "undefined") sessionStorage.removeItem(STORAGE_KEY);
        }
      }, 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects-list-scoped", userId, hydrated],
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: hydrated,
    queryFn: async () => {
      const uid = userId;

      // Foydalanuvchining rollarini olamiz
      let roles: string[] = [];
      if (uid) {
        const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", uid);
        roles = (r ?? []).map((x: any) => x.role);
      }

      const { data, error } = await supabase
        .from("projects")
        .select("id,name,code,firm_id")
        .order("name");
      if (error) throw error;
      const all = sortProjects((data ?? []) as Array<Project & { firm_id: string | null }>);

      // Admin/CEO/Direktor/Finans — hammasi
      if (!uid) return [];
      if (seesAllScope(roles)) {
        return all.map(({ id, name, code }) => ({ id, name, code }));
      }

      // Qolganlar: faqat biriktirilgan loyiha va firma'larga tegishli
      const [{ data: upa }, { data: ufa }] = await Promise.all([
        supabase.from("user_project_access").select("project_id").eq("user_id", uid),
        supabase.from("user_firm_access").select("firm_id").eq("user_id", uid),
      ]);
      const allowedProjects = new Set((upa ?? []).map((x: any) => x.project_id));
      const allowedFirms = new Set((ufa ?? []).map((x: any) => x.firm_id));

      return all
        .filter((p) => allowedProjects.has(p.id) || (p.firm_id && allowedFirms.has(p.firm_id)))
        .map(({ id, name, code }) => ({ id, name, code }));
    },
  });

  // auto-select first project ONLY on initial mount when nothing is stored
  useEffect(() => {
    if (!projects.length) return;
    if (activeProjectId && !projects.find((p) => p.id === activeProjectId)) {
      setActive(projects[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.length]);

  function setActiveProjectId(id: string | null) {
    setActive(id);
    if (typeof window !== "undefined") {
      if (id) sessionStorage.setItem(STORAGE_KEY, id);
      else sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  return (
    <ProjectContext.Provider
      value={{ projects, activeProjectId, activeProject, setActiveProjectId, loading: isLoading }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useActiveProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useActiveProject must be used within ActiveProjectProvider");
  return ctx;
}
