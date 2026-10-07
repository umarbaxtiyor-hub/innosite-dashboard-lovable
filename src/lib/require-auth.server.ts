// Server-only auth helpers for TanStack server routes (raw HTTP endpoints)
// and shared role checks for server functions.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AuthContext = {
  userId: string;
  email: string | null;
  roles: string[];
};

async function verifyToken(token: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Response("Auth not configured", { status: 500 });
  const sb = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new Response("Unauthorized", { status: 401 });
  return data.user;
}

async function fetchRoles(userId: string): Promise<string[]> {
  const url = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) return [];
  const admin = createClient<Database>(url, svc, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return (data ?? []).map((r: any) => String(r.role));
}

// For server routes (raw Request): reads Authorization: Bearer <token>.
export async function requireAuthFromRequest(
  request: Request,
  opts?: { roles?: string[] },
): Promise<AuthContext> {
  const h = request.headers.get("authorization") ?? "";
  if (!h.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });
  const token = h.slice(7).trim();
  if (!token) throw new Response("Unauthorized", { status: 401 });
  const user = await verifyToken(token);
  const roles = await fetchRoles(user.id);
  if (opts?.roles?.length && !opts.roles.some((r) => roles.includes(r))) {
    throw new Response("Forbidden", { status: 403 });
  }
  return { userId: user.id, email: user.email ?? null, roles };
}

// Verify a bearer token string (used from within server functions where the
// bearer is attached via functionMiddleware / requireSupabaseAuth is not used).
export async function verifyBearer(token: string | null | undefined, opts?: { roles?: string[] }): Promise<AuthContext> {
  if (!token) throw new Error("Unauthorized");
  const user = await verifyToken(token);
  const roles = await fetchRoles(user.id);
  if (opts?.roles?.length && !opts.roles.some((r) => roles.includes(r))) {
    throw new Error("Forbidden");
  }
  return { userId: user.id, email: user.email ?? null, roles };
}
