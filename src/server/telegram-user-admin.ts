// Telegram bot — foydalanuvchi boshqaruvi (admin uchun).
// - /sorov  : har kim (ro'yxatda bo'lmasa ham) tizimga kirish so'rovi yuboradi
// - /xodimlar : admin foydalanuvchilar ro'yxatini ko'radi va boshqaradi
// Hech qanday yangi jadval qo'shilmaydi: pending so'rov requester'ning
// telegram_sessions.data.urq ichida saqlanadi.

import { createClient } from "@supabase/supabase-js";
import { ALL_ROLES, ROLE_LABELS, type AppRole } from "@/lib/permissions";

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TG_API = `https://api.telegram.org/bot${TG_TOKEN}`;

function sb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function tg(method: string, body: any) {
  const r = await fetch(`${TG_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json().catch(() => ({}));
}
const send = (chat_id: number, text: string, reply_markup?: any) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", reply_markup });
const editText = (chat_id: number, message_id: number, text: string, reply_markup?: any) =>
  tg("editMessageText", { chat_id, message_id, text, parse_mode: "HTML", reply_markup });
const answerCb = (id: string, text?: string) =>
  tg("answerCallbackQuery", { callback_query_id: id, text });

// ---------- yordamchi ----------
async function isAdmin(uid: number): Promise<boolean> {
  const { data: prof } = await sb()
    .from("profiles").select("id").eq("telegram_user_id", uid).maybeSingle();
  if (!prof?.id) return false;
  const { data } = await sb()
    .from("user_roles").select("role").eq("user_id", prof.id).eq("role", "admin").maybeSingle();
  return !!data;
}

function nameToSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "") || "user";
}
async function createUserWithUniqueEmail(
  fullName: string,
  password: string,
  metadata: Record<string, any>,
): Promise<{ user_id: string; email: string } | { error: string }> {
  const slug = nameToSlug(fullName);
  const supa = sb();
  let lastErr = "";
  for (let i = 0; i < 50; i++) {
    const email = i === 0 ? `${slug}@tizim.local` : `${slug}${i + 1}@tizim.local`;
    const { data, error } = await supa.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (!error && data?.user?.id) return { user_id: data.user.id, email };
    lastErr = error?.message ?? "";
    // If conflict (email already exists) — try next suffix; otherwise abort.
    if (!/already|registered|exist|duplicate/i.test(lastErr)) {
      return { error: lastErr || "akkaunt yaratilmadi" };
    }
  }
  return { error: lastErr || "bo'sh login topilmadi" };
}


// UUID <-> base64url (22 chars) — Telegram callback_data 64 bayt chegarasiga sig'ishi uchun
function uuidToShort(u: string): string {
  const hex = u.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return Buffer.from(bytes).toString("base64url");
}
function shortToUuid(s: string): string {
  const hex = Buffer.from(s, "base64url").toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

function genPin(): string {
  // Esda qoladigan 4 raqamli kodlar: AABB, ABAB, ABBA, AAAA, ketma-ket, yumaloq
  const pins: string[] = [];
  for (let a = 1; a <= 9; a++) {
    for (let b = 0; b <= 9; b++) {
      if (a === b) continue;
      pins.push(`${a}${a}${b}${b}`);   // AABB: 1100, 2233, 5500
      pins.push(`${a}${b}${a}${b}`);   // ABAB: 1010, 1919, 5050
      pins.push(`${a}${b}${b}${a}`);   // ABBA: 1221, 5005
    }
    pins.push(`${a}${a}${a}${a}`);     // AAAA: 1111, 2222
    pins.push(`${a}000`);              // yumaloq: 1000, 5000
    pins.push(`${a}${a}00`);           // 1100, 5500
  }
  // ketma-ket
  ["1234","2345","3456","4567","5678","6789","9876","8765","7654","6543","5432","4321"].forEach((p)=>pins.push(p));
  return pins[Math.floor(Math.random() * pins.length)];
}

function phoneDigits(v: any): string {
  return String(v ?? "").replace(/\D/g, "");
}

async function getRequesterSession(uid: number) {
  const { data } = await sb()
    .from("telegram_sessions").select("*").eq("telegram_user_id", uid).maybeSingle();
  return data as any | null;
}

async function setRequesterFlow(chat_id: number, uid: number, username: string | null, flow: string | null, data: any) {
  await sb().from("telegram_sessions").upsert({
    chat_id, telegram_user_id: uid, username,
    flow, step: null, data, updated_at: new Date().toISOString(),
  });
}

async function notifyAllAdmins(text: string, reply_markup?: any) {
  const { data } = await sb()
    .from("profiles").select("id,telegram_user_id");
  const ids = (data ?? []).filter((p: any) => p.telegram_user_id).map((p: any) => p.id);
  if (!ids.length) return;
  const { data: roles } = await sb()
    .from("user_roles").select("user_id").eq("role", "admin").in("user_id", ids);
  const adminIds = new Set((roles ?? []).map((r: any) => r.user_id));
  const targets = (data ?? []).filter((p: any) => adminIds.has(p.id) && p.telegram_user_id);
  for (const t of targets) {
    try { await send(Number(t.telegram_user_id), text, reply_markup); } catch {}
  }
}

// ---------- /sorov flow ----------
export async function tryStartJoinRequest(chat_id: number, uid: number, username: string | null, text: string): Promise<boolean> {
  const cmd = (text ?? "").trim().toLowerCase().split(/\s+/)[0]?.split("@")[0];
  if (cmd !== "/sorov") return false;
  // mavjudligini tekshirish
  const { data: prof } = await sb()
    .from("profiles").select("id,full_name,is_active").eq("telegram_user_id", uid).maybeSingle();
  if (prof) {
    if (prof.is_active === false) {
      await send(chat_id, "⛔️ Sizning hisobingiz to'xtatilgan. Administratorga murojaat qiling.");
    } else {
      await send(chat_id, `✅ Siz allaqachon ro'yxatdasiz: <b>${prof.full_name ?? "—"}</b>.\n/start ni bosing.`);
    }
    return true;
  }
  await setRequesterFlow(chat_id, uid, username, "urq_name", {
    urq: { stage: "name", uid, username, chat_id, created_at: Date.now() },
  });
  await send(chat_id, "📝 <b>Tizimga kirish so'rovi</b>\n\nIsmingizni yozing:");
  return true;
}

export async function tryHandleJoinFlow(chat_id: number, uid: number, username: string | null, msg: any): Promise<boolean> {
  const s = await getRequesterSession(uid);
  const flow = s?.flow;
  if (flow !== "urq_name" && flow !== "urq_phone") return false;

  // Telefon (contact)
  if (flow === "urq_phone" && msg.contact?.phone_number) {
    const phone = phoneDigits(msg.contact.phone_number);
    const urq = { ...(s.data?.urq ?? {}), phone, full_name: s.data?.urq?.full_name };
    await setRequesterFlow(chat_id, uid, username, "urq_wait", { ...(s.data ?? {}), urq });
    await send(chat_id, "✅ So'rov yuborildi. Administrator tasdiqlaganidan keyin sizga PIN-kod yuboriladi.", { remove_keyboard: true });
    const fn = urq.full_name ?? username ?? `id${uid}`;
    await notifyAllAdmins(
      `🆕 <b>Yangi kirish so'rovi</b>\n\n👤 ${fn}\n📞 +${phone}\n🆔 <code>${uid}</code>${username ? `\n💬 @${username}` : ""}`,
      {
        inline_keyboard: [
          [
            { text: "✅ Tasdiqlash", callback_data: `urq:ok:${uid}` },
            { text: "❌ Rad etish", callback_data: `urq:no:${uid}` },
          ],
        ],
      }
    );
    return true;
  }

  // Ism (matn)
  if (flow === "urq_name") {
    const text: string = (msg.text ?? "").trim();
    if (!text || text.length < 3) {
      await send(chat_id, "❌ Iltimos, ism familiyangizni to'liq yozing (kamida 3 harf).");
      return true;
    }
    const urq = { ...(s.data?.urq ?? {}), full_name: text };
    await setRequesterFlow(chat_id, uid, username, "urq_phone", { ...(s.data ?? {}), urq });
    await send(chat_id, `✅ Ism: <b>${text}</b>\n\nEndi telefon raqamingizni ulashing:`, {
      keyboard: [[{ text: "📱 Telefon raqamni ulashish", request_contact: true }]],
      resize_keyboard: true, one_time_keyboard: true,
    });
    return true;
  }

  if (flow === "urq_phone") {
    await send(chat_id, "📱 Iltimos, pastdagi <b>«Telefon raqamni ulashish»</b> tugmasini bosing.");
    return true;
  }
  return false;
}

// ---------- /xodimlar (admin) ----------
async function listUsersText(): Promise<{ text: string; markup: any }> {
  const { data: profs } = await sb()
    .from("profiles").select("id,full_name,is_active,telegram_user_id").order("full_name", { ascending: true });
  const list = (profs ?? []) as any[];
  if (!list.length) return { text: "Foydalanuvchilar yo'q.", markup: undefined };
  const lines = list.map((p, i) => {
    const dot = p.is_active === false ? "⛔️" : "🟢";
    const tg = p.telegram_user_id ? "📱" : "—";
    return `${i + 1}. ${dot} ${p.full_name ?? "(ismsiz)"} ${tg}`;
  });
  const buttons = list.slice(0, 30).map((p) => [{
    text: `${p.is_active === false ? "⛔️" : "🟢"} ${(p.full_name ?? "(ismsiz)").slice(0, 28)}`,
    callback_data: `usr:m:${p.id}`,
  }]);
  return {
    text: `<b>👥 Foydalanuvchilar (${list.length})</b>\n\n${lines.join("\n")}\n\n<i>Boshqarish uchun pastdagi tugmani bosing.</i>`,
    markup: { inline_keyboard: buttons },
  };
}

async function userDetailMenu(user_id: string) {
  const { data: p } = await sb()
    .from("profiles").select("id,full_name,phone,is_active,telegram_user_id,telegram_username").eq("id", user_id).maybeSingle();
  if (!p) return null;
  const { data: roles } = await sb().from("user_roles").select("role").eq("user_id", user_id);
  const userRoles = new Set((roles ?? []).map((r: any) => r.role as AppRole));
  const text =
    `<b>👤 ${(p as any).full_name ?? "(ismsiz)"}</b>\n` +
    `📞 ${(p as any).phone ?? "—"}\n` +
    `${(p as any).telegram_user_id ? `🆔 <code>${(p as any).telegram_user_id}</code>` : "🆔 —"}` +
    `${(p as any).telegram_username ? `\n💬 @${(p as any).telegram_username}` : ""}\n` +
    `${(p as any).is_active === false ? "⛔️ <b>To'xtatilgan</b>" : "🟢 <b>Faol</b>"}\n\n` +
    `<b>Rollar:</b> ${[...userRoles].map((r) => ROLE_LABELS[r] ?? r).join(", ") || "—"}`;

  const roleBtns: any[] = [];
  for (let i = 0; i < ALL_ROLES.length; i += 2) {
    const row = ALL_ROLES.slice(i, i + 2).map((r) => ({
      text: `${userRoles.has(r) ? "✅" : "▫️"} ${ROLE_LABELS[r] ?? r}`,
      callback_data: `usr:r:${user_id}:${r}`,
    }));
    roleBtns.push(row);
  }
  const markup = {
    inline_keyboard: [
      [
        {
          text: (p as any).is_active === false ? "🟢 Yoqish" : "⛔️ To'xtatish",
          callback_data: `usr:t:${user_id}`,
        },
        { text: "🗑 O'chirish", callback_data: `usr:d:${user_id}` },
      ],
      [{ text: "📁 Loyihalar (ruxsat)", callback_data: `usr:p:${user_id}` }],
      ...roleBtns,
      [{ text: "◀️ Ro'yxatga", callback_data: "usr:list" }],
    ],
  };
  return { text, markup };
}

async function userProjectsMenu(user_id: string) {
  const supa = sb();
  const { data: p } = await supa
    .from("profiles").select("full_name").eq("id", user_id).maybeSingle();
  const { data: roles } = await supa
    .from("user_roles").select("role").eq("user_id", user_id);
  const userRoles = (roles ?? []).map((r: any) => r.role as AppRole);
  const seesAll = userRoles.some((r) => (["admin","ceo","direktor","finans"] as AppRole[]).includes(r));

  const { data: projects } = await supa
    .from("projects").select("id,name,code").order("name", { ascending: true });
  const { data: access } = await supa
    .from("user_project_access").select("project_id").eq("user_id", user_id);
  const allowed = new Set((access ?? []).map((r: any) => r.project_id));

  const list = (projects ?? []) as any[];
  const head = `<b>📁 Loyihalar ruxsati</b>\n👤 ${(p as any)?.full_name ?? "—"}\n\n` +
    (seesAll
      ? "ℹ️ Bu foydalanuvchi roli (admin/ceo/direktor/finans) bo'yicha <b>barcha loyihalarni</b> avtomatik ko'radi. Quyidagi sozlamalar e'tiborga olinmaydi.\n\n"
      : "✅ — ruxsat bor, ▫️ — ruxsat yo'q. Tugmani bosing — o'zgartiriladi.\n\n");
  const lines = list.length
    ? list.map((pr, i) => `${i + 1}. ${allowed.has(pr.id) ? "✅" : "▫️"} ${pr.name}${pr.code ? ` (${pr.code})` : ""}`).join("\n")
    : "Loyihalar yo'q.";

  const buttons = list.slice(0, 40).map((pr) => [{
    text: `${allowed.has(pr.id) ? "✅" : "▫️"} ${String(pr.name).slice(0, 30)}`,
    callback_data: `usr:pt:${uuidToShort(user_id)}:${uuidToShort(pr.id)}`,
  }]);
  buttons.push([{ text: "◀️ Orqaga", callback_data: `usr:m:${user_id}` }]);

  return { text: `${head}${lines}`, markup: { inline_keyboard: buttons } };
}

export async function tryHandleAdminCommand(chat_id: number, uid: number, text: string): Promise<boolean> {
  const cmd = (text ?? "").trim().toLowerCase().split(/\s+/)[0]?.split("@")[0];
  if (cmd !== "/xodimlar" && cmd !== "/users") return false;
  if (!(await isAdmin(uid))) {
    await send(chat_id, "🚫 Bu buyruq faqat admin uchun.");
    return true;
  }
  const { text: t, markup } = await listUsersText();
  await send(chat_id, t, markup);
  return true;
}

// ---------- callback ----------
export async function tryHandleCallback(cb: any): Promise<boolean> {
  const data: string = cb.data ?? "";
  const chat_id = cb.message?.chat?.id;
  const message_id = cb.message?.message_id;
  const uid = cb.from?.id ?? chat_id;
  if (!chat_id) return false;

  // ===== Kirish so'rovi: tasdiqlash/rad =====
  if (data.startsWith("urq:ok:") || data.startsWith("urq:no:")) {
    if (!(await isAdmin(uid))) { await answerCb(cb.id, "🚫 Faqat admin"); return true; }
    const requesterUid = Number(data.split(":")[2]);
    const rs = await getRequesterSession(requesterUid);
    const urq = rs?.data?.urq;
    if (!urq?.full_name || !urq?.phone) {
      await editText(chat_id, message_id, "⚠️ So'rov topilmadi yoki eskirgan.");
      await answerCb(cb.id);
      return true;
    }

    if (data.startsWith("urq:no:")) {
      await setRequesterFlow(Number(rs.chat_id), requesterUid, rs.username ?? null, null, { ...(rs.data ?? {}), urq: null });
      await editText(chat_id, message_id, `❌ Rad etildi.\n👤 ${urq.full_name}\n📞 +${urq.phone}`);
      try { await send(Number(rs.chat_id), "❌ Sizning kirish so'rovingiz rad etildi."); } catch {}
      await answerCb(cb.id, "Rad etildi");
      return true;
    }

    // Tasdiqlash → akkaunt yaratish (login = ism, kerak bo'lsa raqam qo'shiladi)
    const pin = genPin();
    const password = `pin${pin}`;
    const supa = sb();
    const res = await createUserWithUniqueEmail(urq.full_name, password, {
      full_name: urq.full_name,
      phone: `+${urq.phone}`,
    });
    if ("error" in res) {
      await editText(chat_id, message_id, `⚠️ Xato: ${res.error}`);
      await answerCb(cb.id);
      return true;
    }
    const newId = res.user_id;
    const email = res.email;
    // Profil triggeri bilan poyga bo'lmasligi uchun upsert
    await supa.from("profiles").upsert({
      id: newId,
      full_name: urq.full_name,
      phone: `+${urq.phone}`,
      telegram_user_id: requesterUid,
      telegram_username: rs.username ?? null,
      is_active: true,
    }, { onConflict: "id" });
    // Eski telegram_user_id boshqa profilda bo'lsa — uni tozalaymiz
    await supa.from("profiles")
      .update({ telegram_user_id: null })
      .eq("telegram_user_id", requesterUid)
      .neq("id", newId);

    await setRequesterFlow(Number(rs.chat_id), requesterUid, rs.username ?? null, null, { ...(rs.data ?? {}), urq: null });
    await editText(chat_id, message_id, `✅ Tasdiqlandi va akkaunt yaratildi.\n👤 ${urq.full_name}\n📧 <code>${email}</code>\n🔑 PIN: <code>${pin}</code>`);
    try {
      await send(Number(rs.chat_id),
        `✅ <b>Tizimga kirish ruxsati berildi!</b>\n\n👤 ${urq.full_name}\n📧 Login: <code>${email}</code>\n🔑 PIN-kod: <code>${pin}</code>\n\nWeb-saytga kiring va shu PIN bilan tizimga kiring. /start ni bosing.`
      );
    } catch {}
    await answerCb(cb.id, "Tasdiqlandi");
    return true;
  }

  // ===== Foydalanuvchini boshqarish =====
  if (data === "usr:list") {
    if (!(await isAdmin(uid))) { await answerCb(cb.id, "🚫"); return true; }
    const { text, markup } = await listUsersText();
    await editText(chat_id, message_id, text, markup);
    await answerCb(cb.id);
    return true;
  }
  if (data.startsWith("usr:m:")) {
    if (!(await isAdmin(uid))) { await answerCb(cb.id, "🚫"); return true; }
    const user_id = data.slice(6);
    const r = await userDetailMenu(user_id);
    if (!r) { await answerCb(cb.id, "Topilmadi"); return true; }
    await editText(chat_id, message_id, r.text, r.markup);
    await answerCb(cb.id);
    return true;
  }
  if (data.startsWith("usr:t:")) {
    if (!(await isAdmin(uid))) { await answerCb(cb.id, "🚫"); return true; }
    const user_id = data.slice(6);
    const { data: p } = await sb().from("profiles").select("is_active,telegram_user_id").eq("id", user_id).maybeSingle();
    if (!p) { await answerCb(cb.id, "Topilmadi"); return true; }
    // O'zini to'xtata olmaydi
    const { data: me } = await sb().from("profiles").select("id").eq("telegram_user_id", uid).maybeSingle();
    if ((me as any)?.id === user_id && (p as any).is_active !== false) {
      await answerCb(cb.id, "O'zingizni to'xtata olmaysiz");
      return true;
    }
    const next = !((p as any).is_active === false ? false : true);
    await sb().from("profiles").update({ is_active: next }).eq("id", user_id);
    try {
      await sb().auth.admin.updateUserById(user_id, { ban_duration: next ? "none" : "876000h" } as any);
    } catch {}
    const r = await userDetailMenu(user_id);
    if (r) await editText(chat_id, message_id, r.text, r.markup);
    await answerCb(cb.id, next ? "Yoqildi" : "To'xtatildi");
    return true;
  }
  if (data.startsWith("usr:p:")) {
    if (!(await isAdmin(uid))) { await answerCb(cb.id, "🚫"); return true; }
    const user_id = data.slice(6);
    const r = await userProjectsMenu(user_id);
    await editText(chat_id, message_id, r.text, r.markup);
    await answerCb(cb.id);
    return true;
  }
  if (data.startsWith("usr:pt:")) {
    if (!(await isAdmin(uid))) { await answerCb(cb.id, "🚫"); return true; }
    const parts = data.split(":");
    const user_id = shortToUuid(parts[2]);
    const project_id = shortToUuid(parts[3]);
    const supa = sb();
    const { data: existing } = await supa.from("user_project_access")
      .select("user_id").eq("user_id", user_id).eq("project_id", project_id).maybeSingle();
    if (existing) {
      await supa.from("user_project_access").delete()
        .eq("user_id", user_id).eq("project_id", project_id);
    } else {
      await supa.from("user_project_access").insert({ user_id, project_id });
    }
    const r = await userProjectsMenu(user_id);
    await editText(chat_id, message_id, r.text, r.markup);
    await answerCb(cb.id, existing ? "Olib tashlandi" : "Berildi");
    return true;
  }
  if (data.startsWith("usr:d:")) {
    if (!(await isAdmin(uid))) { await answerCb(cb.id, "🚫"); return true; }
    const user_id = data.slice(6);
    const { data: me } = await sb().from("profiles").select("id").eq("telegram_user_id", uid).maybeSingle();
    if ((me as any)?.id === user_id) {
      await answerCb(cb.id, "O'zingizni o'chira olmaysiz");
      return true;
    }
    await editText(chat_id, message_id, "⚠️ <b>Akkauntni butunlay o'chirasizmi?</b>\n\nBu amalni qaytarib bo'lmaydi.", {
      inline_keyboard: [
        [
          { text: "🗑 Ha, o'chir", callback_data: `usr:dok:${user_id}` },
          { text: "↩️ Bekor", callback_data: `usr:m:${user_id}` },
        ],
      ],
    });
    await answerCb(cb.id);
    return true;
  }
  if (data.startsWith("usr:dok:")) {
    if (!(await isAdmin(uid))) { await answerCb(cb.id, "🚫"); return true; }
    const user_id = data.slice(8);
    const supa = sb();
    await supa.from("user_project_access").delete().eq("user_id", user_id);
    await supa.from("user_firm_access").delete().eq("user_id", user_id);
    await supa.from("user_roles").delete().eq("user_id", user_id);
    const { error } = await supa.auth.admin.deleteUser(user_id);
    if (error) {
      await editText(chat_id, message_id, `⚠️ Xato: ${error.message}`);
      await answerCb(cb.id);
      return true;
    }
    const { text, markup } = await listUsersText();
    await editText(chat_id, message_id, `🗑 O'chirildi.\n\n${text}`, markup);
    await answerCb(cb.id, "O'chirildi");
    return true;
  }
  if (data.startsWith("usr:r:")) {
    if (!(await isAdmin(uid))) { await answerCb(cb.id, "🚫"); return true; }
    const parts = data.split(":");
    const user_id = parts[2];
    const role = parts[3] as AppRole;
    if (!ALL_ROLES.includes(role)) { await answerCb(cb.id, "Noto'g'ri rol"); return true; }
    // O'zidan admin rolini olib tashlamaslik
    const { data: me } = await sb().from("profiles").select("id").eq("telegram_user_id", uid).maybeSingle();
    const { data: existing } = await sb().from("user_roles")
      .select("id").eq("user_id", user_id).eq("role", role).maybeSingle();
    if (existing) {
      if ((me as any)?.id === user_id && role === "admin") {
        await answerCb(cb.id, "O'zingizdan adminni olib bo'lmaydi");
        return true;
      }
      await sb().from("user_roles").delete().eq("user_id", user_id).eq("role", role);
    } else {
      await sb().from("user_roles").insert({ user_id, role });
    }
    const r = await userDetailMenu(user_id);
    if (r) await editText(chat_id, message_id, r.text, r.markup);
    await answerCb(cb.id, existing ? "Olib tashlandi" : "Berildi");
    return true;
  }

  return false;
}
