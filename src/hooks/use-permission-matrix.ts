import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PAGE_PERMISSIONS, type AppRole } from "@/lib/permissions";

export type PermissionMatrix = Record<string, AppRole[]>;

/** DB'dan role_permissions ni o'qib, path -> roles[] matritsasini qaytaradi.
 *  Agar DB bo'sh bo'lsa yoki xatolik bo'lsa, defaultlarga qaytadi. */
export function usePermissionMatrix() {
  const { data, isLoading } = useQuery({
    queryKey: ["role-permissions"],
    queryFn: async (): Promise<PermissionMatrix> => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role, path");
      if (error || !data || data.length === 0) return PAGE_PERMISSIONS;
      const m: PermissionMatrix = {};
      for (const row of data as Array<{ role: AppRole; path: string }>) {
        (m[row.path] ||= []).push(row.role);
      }
      return m;
    },
    staleTime: 60_000,
  });
  return { matrix: data ?? PAGE_PERMISSIONS, loading: isLoading };
}
