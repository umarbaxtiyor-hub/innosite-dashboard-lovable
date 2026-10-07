import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useCurrentRoles() {
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadRoles(userId?: string | null, options?: { showLoading?: boolean }) {
      if (active && options?.showLoading !== false) setLoading(true);
      const uid = userId ?? (await supabase.auth.getSession()).data.session?.user?.id ?? null;
      userIdRef.current = uid;
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

    void loadRoles(undefined, { showLoading: true });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      const nextUserId = session?.user?.id ?? null;
      if (event === "SIGNED_IN" && nextUserId === userIdRef.current) return;
      window.setTimeout(() => void loadRoles(nextUserId, { showLoading: event === "SIGNED_OUT" }), 0);
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
