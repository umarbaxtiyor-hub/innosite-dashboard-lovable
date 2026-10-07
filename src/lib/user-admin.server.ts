export async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function authAdmin(token: string): Promise<string> {
  const supabaseAdmin = await getAdmin();
  if (!token) throw new Error("Avtorizatsiya kerak");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new Error("Sessiya topilmadi");
  const userId = data.user.id;
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!roleRow) throw new Error("Faqat adminlar uchun");
  return userId;
}

export function nameToEmail(name: string): string {
  const slug = name.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "");
  return `${slug}@tizim.local`;
}
