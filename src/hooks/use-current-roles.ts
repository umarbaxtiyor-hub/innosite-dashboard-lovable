import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useCurrentRoles() {
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadRoles(userId?: string | null) {
      if (active) setLoading(true);
      const uid = userId ?? (await supabase.auth.getSession()).data.session?.user?.id ?? null;
      if (!uid) {
        if (active) { setRoles([]); setLoading(false); }
        return;
      }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (active) {
        setRoles((data ?? []).map((r: any) => r.role));
        setLoading(false);
      }
    }

    void loadRoles();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => void loadRoles(session?.user?.id ?? null), 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const has = (r: string) => roles.includes(r);
  const hasAny = (rs: string[]) => rs.some((r) => roles.includes(r));
  return { roles, loading, has, hasAny };
}
