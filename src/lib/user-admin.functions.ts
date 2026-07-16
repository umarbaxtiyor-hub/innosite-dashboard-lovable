import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function authAdmin(token: string): Promise<string> {
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

export const listUsersWithRoles = createServerFn({ method: "POST" })
  .inputValidator((d: any) => z.object({ token: z.string() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    await authAdmin(data.token);
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, telegram_user_id, telegram_username, phone, is_active, firm_id")
      .order("full_name", { ascending: true });
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id, role");
    const { data: ups } = await supabaseAdmin
      .from("user_project_access").select("user_id, project_id");
    const { data: ufs } = await supabaseAdmin
      .from("user_firm_access").select("user_id, firm_id");
    const byRole: Record<string, string[]> = {};
    (roles ?? []).forEach((r: any) => { (byRole[r.user_id] ??= []).push(r.role); });
    const byProj: Record<string, string[]> = {};
    (ups ?? []).forEach((r: any) => { (byProj[r.user_id] ??= []).push(r.project_id); });
    const byFirm: Record<string, string[]> = {};
    (ufs ?? []).forEach((r: any) => { (byFirm[r.user_id] ??= []).push(r.firm_id); });
    return (profs ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name as string | null,
      telegram_user_id: p.telegram_user_id as number | null,
      telegram_username: p.telegram_username as string | null,
      phone: p.phone as string | null,
      is_active: (p.is_active ?? true) as boolean,
      firm_id: p.firm_id as string | null,
      roles: byRole[p.id] ?? [],
      project_ids: byProj[p.id] ?? [],
      firm_ids: byFirm[p.id] ?? [],
    }));
  });

export const setUserRole = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string(),
    user_id: z.string().uuid(),
    role: z.string(),
    enabled: z.boolean(),
  }).parse(d))
  .handler(async ({ data }) => {
    const adminId = await authAdmin(data.token);
    if (!data.enabled && data.role === "admin" && data.user_id === adminId) {
      throw new Error("O'zingizdan admin rolini olib tashlay olmaysiz");
    }
    if (data.enabled) {
      const { error } = await supabaseAdmin.from("user_roles")
        .insert({ user_id: data.user_id, role: data.role as any });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("user_roles")
        .delete().eq("user_id", data.user_id).eq("role", data.role as any);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setUserTelegramId = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string(),
    user_id: z.string().uuid(),
    telegram_user_id: z.number().int().nullable(),
  }).parse(d))
  .handler(async ({ data }) => {
    await authAdmin(data.token);
    const { error } = await supabaseAdmin.from("profiles")
      .update({ telegram_user_id: data.telegram_user_id })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function nameToEmail(name: string): string {
  const slug = name.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "");
  return `${slug}@tizim.local`;
}

export const createUserAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string(),
    full_name: z.string().min(2, "Ism kamida 2 harf"),
    pin: z.string().regex(/^\d{4}$/, "Parol 4 raqam bo'lsin"),
    phone: z.string().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    await authAdmin(data.token);
    const email = nameToEmail(data.full_name);
    if (email.length < 8) throw new Error("Ism noto'g'ri (kamida 2 harf)");
    const password = `pin${data.pin}`;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, phone: data.phone ?? "" },
    });
    if (error) throw new Error(error.message);
    const uid = created.user?.id;
    if (uid) {
      await supabaseAdmin.from("profiles").update({
        full_name: data.full_name,
        phone: data.phone ?? "",
      }).eq("id", uid);
    }
    return { ok: true, user_id: uid, email };
  });

export const deleteUserAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string(),
    user_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data }) => {
    const adminId = await authAdmin(data.token);
    if (data.user_id === adminId) throw new Error("O'zingizni o'chira olmaysiz");
    await supabaseAdmin.from("user_project_access").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_firm_access").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string(),
    user_id: z.string().uuid(),
    active: z.boolean(),
  }).parse(d))
  .handler(async ({ data }) => {
    const adminId = await authAdmin(data.token);
    if (!data.active && data.user_id === adminId) throw new Error("O'zingizni to'xtata olmaysiz");
    const { error } = await supabaseAdmin.from("profiles")
      .update({ is_active: data.active }).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    // ban/unban auth user too
    const { error: aerr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.active ? "none" : "876000h",
    } as any);
    if (aerr) throw new Error(aerr.message);
    return { ok: true };
  });

export const setUserProjects = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string(),
    user_id: z.string().uuid(),
    project_ids: z.array(z.string().uuid()),
  }).parse(d))
  .handler(async ({ data }) => {
    await authAdmin(data.token);
    await supabaseAdmin.from("user_project_access").delete().eq("user_id", data.user_id);
    if (data.project_ids.length > 0) {
      const rows = data.project_ids.map((pid) => ({ user_id: data.user_id, project_id: pid }));
      const { error } = await supabaseAdmin.from("user_project_access").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setUserFirms = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string(),
    user_id: z.string().uuid(),
    firm_ids: z.array(z.string().uuid()),
  }).parse(d))
  .handler(async ({ data }) => {
    await authAdmin(data.token);
    await supabaseAdmin.from("user_firm_access").delete().eq("user_id", data.user_id);
    if (data.firm_ids.length > 0) {
      const rows = data.firm_ids.map((fid) => ({ user_id: data.user_id, firm_id: fid }));
      const { error } = await supabaseAdmin.from("user_firm_access").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
