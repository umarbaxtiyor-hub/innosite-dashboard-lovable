// Telegram bot — sodda AI yordamchi.
// Foydalanuvchi kun davomida xarajat/material/zayavka yozadi (matn/ovoz/rasm) →
// AI har birini avtomatik kategoriyaga ajratadi → DRAFT ga qo'shiladi →
// Foydalanuvchi "✅ Tasdiqlash" tugmasini bosgach hammasi DB ga yoziladi.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSheetContext, detectDayReportRequest, buildSheetDayPdf, appendFuelEntries, buildFuelDayPdf, detectReportKind, getFuelContext, detectExcelRequest, buildSheetExcel, appendHrEntries, buildHrDayPdf, getHrContext, appendDprEntries, buildDprDayPdf, getDprContext } from "./sheets-sync.server";
import {
  tryStartJoinRequest,
  tryHandleJoinFlow,
  tryHandleAdminCommand,
  tryHandleAdminFlow,
  tryHandleCallback as tryHandleUserAdminCallback,
} from "@/server/telegram-user-admin";

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TG_API = `https://api.telegram.org/bot${TG_TOKEN}`;
const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY!;

const admin = () => supabaseAdmin as unknown as SupabaseClient;

// ---------- Telegram API ----------
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

// ---------- Uzbek TTS text normalizer (faqat ovoz uchun matnni tabiiylashtirish) ----------
const UZ_ONES = ["", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"];
const UZ_TENS = ["", "o'n", "yigirma", "o'ttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "to'qson"];

function uzUnder1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  if (h) parts.push(`${h > 1 ? UZ_ONES[h] + " " : ""}yuz`);
  if (t) parts.push(UZ_TENS[t]);
  if (o) parts.push(UZ_ONES[o]);
  return parts.join(" ").trim();
}

function uzNumberToWords(num: number): string {
  if (!isFinite(num)) return "";
  if (num === 0) return "nol";
  const neg = num < 0;
  let n = Math.floor(Math.abs(num));
  const frac = Math.round((Math.abs(num) - n) * 100);
  const groups: { value: number; name: string }[] = [
    { value: 1_000_000_000, name: "milliard" },
    { value: 1_000_000, name: "million" },
    { value: 1_000, name: "ming" },
  ];
  const out: string[] = [];
  for (const g of groups) {
    const q = Math.floor(n / g.value);
    if (q > 0) {
      out.push(`${q === 1 && g.name === "ming" ? "" : uzUnder1000(q) + " "}${g.name}`.trim());
      n -= q * g.value;
    }
  }
  if (n > 0) out.push(uzUnder1000(n));
  let res = out.join(" ").replace(/\s+/g, " ").trim();
  if (frac > 0) res += ` butun yuzdan ${uzUnder1000(frac)}`;
  return (neg ? "minus " : "") + res;
}

function naturalizeUzbekForTts(input: string): string {
  let s = input;

  // Markdown / HTML / kod bloklarini olib tashlash
  s = s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/!?\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " havola ")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/[*_#>|~^]/g, " ");

  // Emoji va maxsus belgilar
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, " ");

  // Ro'yxat belgilari -> tabiiy pauza
  s = s.replace(/^\s*[-•▪●]\s*/gm, "").replace(/\n{2,}/g, ". ").replace(/\n/g, ", ");

  // Sana formati 2026-09-01 -> tabiiy o'qilishi
  const UZ_MONTHS = ["", "yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
  s = s.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, y, mo, d) =>
    `${uzNumberToWords(+y)} yil ${uzNumberToWords(+d)} ${UZ_MONTHS[+mo] ?? ""}`.trim());

  // Foiz
  s = s.replace(/(\d[\d\s.,]*)\s*%/g, (_m, num) => `${numToUz(num)} foiz`);

  // Pul: 1 500 000 so'm / UZS / mln / mlrd (kasrli qiymatlar ko'paytiriladi)
  const scaled = (raw: string, mult: number, word: string) => {
    const n = parseNum(raw);
    if (n === null) return `${String(raw).trim()} ${word} so'm`;
    return `${uzNumberToWords(n * mult)} so'm`;
  };
  s = s.replace(/(\d[\d\s.,]*)\s*(mlrd|milliard)\b/gi, (_m, num) => scaled(num, 1_000_000_000, "milliard"));
  s = s.replace(/(\d[\d\s.,]*)\s*(mln|million)\b/gi, (_m, num) => scaled(num, 1_000_000, "million"));
  s = s.replace(/(\d[\d\s.,]*)\s*(so'm|som|soʻm|UZS|uzs)\b/g, (_m, num) => `${numToUz(num)} so'm`);

  // Qisqartmalar
  s = s
    .replace(/\bBOQ\b/g, "bi o kyu")
    .replace(/\bPM\b/g, "loyiha rahbari")
    .replace(/\bCEO\b/gi, "bosh direktor")
    .replace(/\bHR\b/g, "kadrlar bo'limi")
    .replace(/\bKPI\b/gi, "ko'rsatkich")
    .replace(/\bPDF\b/gi, "pi di ef")
    .replace(/\bAI\b/g, "sun'iy intellekt")
    .replace(/\bt\/r\b/gi, "tartib raqami")
    .replace(/\bdona\b/g, "dona")
    .replace(/\bkv\.?m\b/gi, "kvadrat metr")
    .replace(/\bm2\b/gi, "kvadrat metr")
    .replace(/\bm3\b/gi, "kub metr")
    .replace(/\bkg\b/g, "kilogramm")
    .replace(/\bsht\b/gi, "dona");

  // Qolgan sonlarni so'zga aylantirish
  s = s.replace(/\d[\d\s.,]*\d|\d/g, (m) => numToUz(m));

  // Tabiiy pauzalar va tozalash
  s = s
    .replace(/\s*:\s*/g, " — ")
    .replace(/\s*—\s*([,.;])/g, "$1")
    .replace(/\s*;\s*/g, ", ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/([,.!?]){2,}/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (s && !/[.!?]$/.test(s)) s += ".";
  return s;
}

function parseNum(raw: string): number | null {
  const cleaned = String(raw)
    .trim()
    .replace(/\s/g, "")
    .replace(/,(?=\d{3}\b)/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".")
    .replace(/[.,]$/, "");
  const n = Number(cleaned);
  return isFinite(n) && cleaned !== "" ? n : null;
}

function numToUz(raw: string): string {
  const n = parseNum(raw);
  if (n === null) return String(raw).trim();
  return uzNumberToWords(n);
}

// ---------- Aisha TTS (o'zbek tilida ovozli javob) ----------
// UzbekVoice.ai TTS — o'zbek tilida tabiiy ovoz
export async function aishaTts(text: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.AISHA_API_KEY;
  if (!apiKey) {
    console.warn("[uzbekvoice] API kalit yo'q");
    return null;
  }
  const clean = naturalizeUzbekForTts(text).slice(0, 900);
  if (!clean) {
    console.warn("[uzbekvoice] bo'sh matn");
    return null;
  }
  try {
    const res = await fetch("https://uzbekvoice.ai/api/v1/tts", {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean, model: "sevinch" }),
    });
    if (!res.ok) {
      console.warn("[uzbekvoice] tts failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const j = (await res.json().catch(() => null)) as
      | { result?: { url?: string }; status?: string }
      | null;
    const url = j?.result?.url;
    if (!url) {
      console.warn("[uzbekvoice] audio url yo'q", JSON.stringify(j));
      return null;
    }
    const audioRes = await fetch(url);
    if (!audioRes.ok) {
      console.warn("[uzbekvoice] audio fetch failed", audioRes.status);
      return null;
    }
    return await audioRes.arrayBuffer();
  } catch (e) {
    console.warn("[uzbekvoice] tts exception", e);
    return null;
  }
}

// WAV (PCM 16-bit) → MP3. Telegram sendVoice MP3 ni rasman qabul qiladi va tiniq ijro etadi
// (WAV ni "ogg" deb yuborish ovozni qotirib/buzib qo'yardi).
async function wavToMp3(wav: ArrayBuffer): Promise<Uint8Array | null> {
  try {
    const dv = new DataView(wav);
    if (dv.getUint32(0, false) !== 0x52494646) return null; // "RIFF"
    let off = 12, channels = 1, rate = 24000, bits = 16, dataOff = 0, dataLen = 0;
    while (off + 8 <= dv.byteLength) {
      const id = dv.getUint32(off, false), size = dv.getUint32(off + 4, true);
      if (id === 0x666d7420) { channels = dv.getUint16(off + 10, true); rate = dv.getUint32(off + 12, true); bits = dv.getUint16(off + 22, true); }
      else if (id === 0x64617461) { dataOff = off + 8; dataLen = Math.min(size, dv.byteLength - dataOff); break; }
      off += 8 + size + (size % 2);
    }
    if (!dataOff || bits !== 16) return null;
    const total = Math.floor(dataLen / 2 / channels);
    const mono = new Int16Array(total);
    for (let i = 0; i < total; i++) mono[i] = dv.getInt16(dataOff + i * 2 * channels, true);
    const { Mp3Encoder } = await import("@breezystack/lamejs");
    const enc = new Mp3Encoder(1, rate, 64);
    const parts: Uint8Array[] = [];
    for (let i = 0; i < total; i += 1152) {
      const b = enc.encodeBuffer(mono.subarray(i, i + 1152));
      if (b.length) parts.push(new Uint8Array(b));
    }
    const end = enc.flush();
    if (end.length) parts.push(new Uint8Array(end));
    const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let p = 0; for (const x of parts) { out.set(x, p); p += x.length; }
    return out;
  } catch (e) {
    console.warn("[tts] mp3 encode failed", e);
    return null;
  }
}

async function sendVoice(chat_id: number, audio: ArrayBuffer, caption?: string): Promise<boolean> {
  const mp3 = await wavToMp3(audio);
  const tryEndpoint = async (endpoint: "sendVoice" | "sendAudio"): Promise<boolean> => {
    const form = new FormData();
    form.append("chat_id", String(chat_id));
    if (caption) {
      form.append("caption", caption.slice(0, 1000));
      form.append("parse_mode", "HTML");
    }
    const field = endpoint === "sendVoice" ? "voice" : "audio";
    if (mp3) form.append(field, new Blob([mp3 as BlobPart], { type: "audio/mpeg" }), "fina.mp3");
    else form.append(field, new Blob([audio], { type: "audio/wav" }), "fina.wav");
    try {
      const r = await fetch(`${TG_API}/${endpoint}`, { method: "POST", body: form });
      if (!r.ok) {
        console.warn(`[tg] ${endpoint} failed`, r.status, await r.text().catch(() => ""));
        return false;
      }
      return true;
    } catch (e) {
      console.warn(`[tg] ${endpoint} exception`, e);
      return false;
    }
  };
  if (await tryEndpoint("sendVoice")) return true;
  return await tryEndpoint("sendAudio");
}

// ---------- Asosiy klaviatura ----------
const AI_ROLES = ["admin", "pm", "direktor", "ceo"] as const;
const aiAllowedByChat = new Map<number, boolean>();
const ceoOnlyByChat = new Map<number, boolean>();
type BotButtonKey = "project" | "fuel" | "ledger" | "dpr" | "hr" | "innoai";
const ALL_BOT_BUTTONS: BotButtonKey[] = ["project", "fuel", "ledger", "dpr", "hr", "innoai"];
const buttonAccessByChat = new Map<number, Set<BotButtonKey>>();

async function getTgRoles(uid: number): Promise<string[]> {
  try {
    const { data: prof } = await admin()
      .from("profiles").select("id").eq("telegram_user_id", uid).maybeSingle();
    if (!prof?.id) return [];
    const { data } = await admin().from("user_roles").select("role").eq("user_id", prof.id);
    return (data ?? []).map((r: any) => String(r.role));
  } catch { return []; }
}

async function checkAiAccess(uid: number): Promise<boolean> {
  const roles = await getTgRoles(uid);
  return roles.some((r) => (AI_ROLES as readonly string[]).includes(r));
}

/** Faqat CEO (admin/finans emas) — botda faqat AI savol-javob rejimi. */
async function checkCeoOnly(uid: number): Promise<boolean> {
  const roles = await getTgRoles(uid);
  if (roles.includes("admin") || roles.includes("finans")) return false;
  return roles.includes("ceo");
}

async function loadButtonAccess(chatId: number, uid: number): Promise<Set<BotButtonKey>> {
  if (isGroupChat(chatId)) return new Set();
  const sb = admin();
  const { data: profile } = await sb.from("profiles").select("id").eq("telegram_user_id", uid).maybeSingle();
  if (!profile?.id) return new Set();
  const roles = await getTgRoles(uid);
  const { data } = await sb.from("user_bot_permissions").select("button_key").eq("user_id", profile.id);
  const keys = new Set<BotButtonKey>();
  for (const row of data ?? []) {
    const key = String((row as any).button_key) as BotButtonKey;
    if (ALL_BOT_BUTTONS.includes(key)) keys.add(key);
  }
  if (roles.includes("ceo") && !roles.includes("admin") && !roles.includes("finans")) return new Set(["innoai"]);
  // Hech qanday tugma biriktirilmagan bo'lsa — standart: admin/finans hammasi, boshqalar Daftar.
  if (keys.size === 0) {
    if (roles.includes("admin") || roles.includes("finans")) ALL_BOT_BUTTONS.forEach((key) => keys.add(key));
    else keys.add("ledger");
  }
  return keys;
}


const projectNameByChat = new Map<number, string>();
// Joriy ko'rsatilayotgan loyiha-picker ro'yxati (chat bo'yicha): tugma matni -> project_id
const projectPickByChat = new Map<number, Map<string, string>>();

// Smeta item picker: tugma matni -> tanlangan item ma'lumotlari
type SmetaPickItem = {
  id: string;
  kind: "material" | "work";
  name: string;
  unit: string;
  unit_price: number;
  qty_plan: number;
  used: number;
  master_material_id: string | null;
  master_work_id: string | null;
  off_plan: boolean;
};
const smetaPickByChat = new Map<number, Map<string, SmetaPickItem>>();


/** Telegramda guruh/superguruh chat_id har doim manfiy bo'ladi. */
function isGroupChat(chatId?: number | null): boolean {
  return typeof chatId === "number" && chatId < 0;
}

function mainMenu(draftCount = 0, _chatId?: number) {
  // Guruhda hech qanday tugma chiqmaydi — guruh faqat xarajat yozish uchun.
  if (isGroupChat(_chatId)) return undefined;
  const allowed = buttonAccessByChat.get(_chatId ?? 0) ?? new Set<BotButtonKey>();
  const buttons: Array<{ key: BotButtonKey; text: string }> = [
    { key: "project", text: "📊 Loyiha" },
    { key: "fuel", text: "⛽ Salyarka" },
    { key: "ledger", text: `📒 Daftar (${draftCount})` },
    { key: "dpr", text: "📄 DPR" },
    { key: "hr", text: "👥 HR" },
    { key: "innoai", text: "✨ Fina" },
  ];
  const visible = buttons.filter((button) => allowed.has(button.key));
  const keyboard: Array<Array<{ text: string }>> = [];
  for (let index = 0; index < visible.length; index += 2) {
    keyboard.push(visible.slice(index, index + 2).map((button) => ({ text: button.text })));
  }
  return {
    keyboard,
    resize_keyboard: true,
  };
}

function canUseButton(chatId: number, key: BotButtonKey): boolean {
  return buttonAccessByChat.get(chatId)?.has(key) === true;
}

let botCommandsSynced = false;
async function removeAiFromCommandMenu() {
  if (botCommandsSynced) return;
  botCommandsSynced = true;
  try {
    const current = await tg("getMyCommands", {});
    const commands = Array.isArray(current?.result)
      ? current.result.filter((command: any) => String(command?.command ?? "").toLowerCase() !== "ai")
      : [];
    await tg("setMyCommands", { commands });
  } catch (error) {
    console.warn("[tg] AI command menu cleanup failed", error);
  }
}

/** Salyarka xabaridan litr yozuvlarini ajratadi (summa yo'q). */
async function aiJsonObject(key: string, system: string, raw: string): Promise<any | null> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: raw },
      ],
    }),
  });
  if (!res.ok) return null;
  const j: any = await res.json();
  return JSON.parse(String(j?.choices?.[0]?.message?.content ?? "{}").replace(/^```json|```$/g, ""));
}

async function aiParseFuel(raw: string): Promise<{ date: string; type: string; tech: string; driver: string; liters: number; note: string }[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return [];
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  try {
    const parsed = await aiJsonObject(key, `Salyarka (dizel) hisobi. Bugun ${today}. Xabardan yozuvlarni ajrat va faqat JSON qaytar: {"items":[{"date":"YYYY-MM-DD","type":"CHIQIM|KIRIM","tech":"Texnika nomi va raqami (masalan Ekskavator 871)","driver":"haydovchi ismi yoki bo'sh","liters":raqam,"note":"qo'shimcha izoh yoki bo'sh"}]}. Texnikaga quyildi = CHIQIM; bazaga keldi/olindi = KIRIM. «kecha» bo'lsa sanani bir kun oldin qil. Summa/narx yozma. O'zingdan so'z qo'shma.`, raw);
    if (!parsed) return [];
    return ((parsed.items ?? []) as any[])
      .map((e) => ({
        date: String(e.date || today),
        type: String(e.type).toUpperCase() === "KIRIM" ? "KIRIM" : "CHIQIM",
        tech: String(e.tech ?? "").trim(),
        driver: String(e.driver ?? "").trim(),
        liters: Number(e.liters) || 0,
        note: String(e.note ?? "").trim(),
      }))
      .filter((e) => e.liters > 0);
  } catch {
    return [];
  }
}

async function aiParseHr(raw: string): Promise<{ date: string; type: string; name: string; role: string; project: string; note: string }[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return [];
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  try {
    const parsed = await aiJsonObject(key, `HR (kadrlar/davomat) hisobi. Bugun ${today}. Xabardan yozuvlarni ajrat va faqat JSON qaytar: {"items":[{"date":"YYYY-MM-DD","type":"DAVOMAT|KELMADI|QABUL|CHIQDI|BOSHQA","name":"xodim ismi","role":"lavozim yoki bo'sh","project":"loyiha nomi yoki bo'sh","note":"izoh yoki bo'sh"}]}. Ishga keldi/ishda = DAVOMAT; kelmadi/kasal/ta'til = KELMADI; ishga qabul qilindi = QABUL; ishdan ketdi/chiqarildi = CHIQDI. «kecha» bo'lsa sanani bir kun oldin qil. O'zingdan so'z qo'shma.`, raw);
    if (!parsed) return [];
    return ((parsed.items ?? []) as any[])
      .map((e) => ({
        date: String(e.date || today),
        type: String(e.type ?? "DAVOMAT").toUpperCase(),
        name: String(e.name ?? "").trim(),
        role: String(e.role ?? "").trim(),
        project: String(e.project ?? "").trim(),
        note: String(e.note ?? "").trim(),
      }))
      .filter((e) => e.name);
  } catch {
    return [];
  }
}

async function aiParseDpr(raw: string): Promise<{ date: string; direction: string; block: string; work: string; qty: number; unit: string; note: string }[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return [];
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  try {
    const parsed = await aiJsonObject(key, `DPR — qurilishdagi kunlik bajarilgan ish hajmi hisobi (pul emas!). Bugun ${today}. Xabardan yozuvlarni ajrat va faqat JSON qaytar: {"items":[{"date":"YYYY-MM-DD","direction":"yo'nalish (Tracker, Blok, Inshoot va h.k.) yoki bo'sh","block":"blok raqami yoki bo'sh","work":"ish turi / komponent nomi","qty":0,"unit":"o'lchov birligi (dona, m, m2, m3, kg, ta va h.k.)","note":"izoh yoki bo'sh"}]}. «kecha» bo'lsa sanani bir kun oldin qil. Summa/so'm yozma — bu yerda faqat hajm. O'zingdan so'z qo'shma.`, raw);
    if (!parsed) return [];
    return ((parsed.items ?? []) as any[])
      .map((e) => ({
        date: String(e.date || today),
        direction: String(e.direction ?? "").trim(),
        block: String(e.block ?? "").trim(),
        work: String(e.work ?? "").trim(),
        qty: Number(e.qty) || 0,
        unit: String(e.unit ?? "").trim(),
        note: String(e.note ?? "").trim(),
      }))
      .filter((e) => e.work || e.direction);
  } catch {
    return [];
  }
}



function smetaMenu() {
  return {
    keyboard: [
      [{ text: "📦 Materiallar" }, { text: "🔨 Ish turlari" }],
      [{ text: "➕ Yordamchi" }],
      [{ text: "↩️ Orqaga" }],
    ],
    resize_keyboard: true,
  };
}

function buxMenu() {
  return {
    keyboard: [
      [{ text: "🚚 Nakladnoy" }, { text: "📄 Shartnoma" }],
      [{ text: "🧾 Faktura" }, { text: "💸 To'lov so'rash" }],
      [{ text: "↩️ Orqaga" }],
    ],
    resize_keyboard: true,
  };
}

// Loyihalar ro'yxatini matndan topish
async function detectProjectFromText(text: string, fallbackId: string | null): Promise<{ id: string; name: string } | null> {
  const { data } = await admin().from("projects").select("id,name,code").eq("status", "active").limit(100);
  const list = (data ?? []) as Array<{ id: string; name: string; code: string | null }>;
  if (!list.length) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "");
  const t = norm(text || "");
  // 1) Kod bo'yicha
  for (const p of list) {
    if (p.code && t.includes(norm(p.code))) return { id: p.id, name: p.name };
  }
  // 2) Nom bo'yicha
  for (const p of list) {
    if (p.name && norm(p.name).length >= 3 && t.includes(norm(p.name))) return { id: p.id, name: p.name };
  }
  // 3) Fallback — joriy tanlangan loyiha
  if (fallbackId) {
    const f = list.find(p => p.id === fallbackId);
    if (f) return { id: f.id, name: f.name };
  }
  return null;
}

function chatMenu() {
  return {
    keyboard: [
      [{ text: "⬅️ Orqaga" }],
    ],
    resize_keyboard: true,
  };
}


// ---------- AI agent (loyiha bo'yicha savol-javob) ----------
async function askAgent(history: { role: "user" | "assistant"; content: string }[], project_id: string | null, client: "voice" | "mobile" | "web" | undefined, telegram_user_id: number): Promise<string> {
  try {
    const url = `${process.env.SUPABASE_URL}/functions/v1/ai-agent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ messages: history, project_id, client: client ?? "mobile", telegram_user_id }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return `⚠️ ${j?.error ?? "AI xato"}`;
    return (j?.reply ?? "").toString().trim() || "🤔 Javob bo'sh.";
  } catch (e: any) {
    return `⚠️ Tarmoq xatosi: ${e?.message ?? e}`;
  }
}

// Sheet asosidagi javob: faqat berilgan jadval ma'lumotiga tayanadi (bazaga murojaat yo'q),
// shunda raqamlar Sheet bilan aynan bir xil bo'ladi.
async function askSheetAi(
  prev: { role: "user" | "assistant"; content: string }[],
  ctx: string,
  question: string,
  voice: boolean,
): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return "⚠️ AI kaliti sozlanmagan.";
  const nowT = new Date();
  const todayIso = nowT.toISOString().slice(0, 10);
  const yesterdayIso = new Date(nowT.getTime() - 864e5).toISOString().slice(0, 10);
  const system = `Bugun: ${todayIso}. Kecha: ${yesterdayIso}.
Sen Fina — shu firmaning loyiha boshqaruvchisi va CEOlar uchun aniq tahliliy yordamchisan. O'zingni barcha loyihalarning holati, kassa xarajatlari va salyarka harakatlarini berilgan manbalar doirasida biladigan mas'ul rahbar sifatida tut. MANBA 1 — naqd kassa (so'm), MANBA 2 — salyarka (litr, texnika, haydovchi).
QAT'IY QOIDALAR:
0. Salyarka/litr/texnika/haydovchi sarfi so'ralsa — MANBA 2 (SALYARKA QIDIRUV) dan litrda javob ber. Pul so'ralsa — MANBA 1. Litr va so'mni aralashtirma.
1. FAQAT pastdagi JADVAL MA'LUMOTLARI dan foydalan. Raqam o'ylab topma, taxmin qilma.
2. Summa so'ralsa — QIDIRUV blokidagi «JAMI CHIQIM/JAMI KIRIM» raqamini aynan ko'chir, o'zing qayta qo'shma.
3. Umumiy kassa/jami savollarda — JAMI KIRIM, JAMI CHIQIM, KASSA QOLDIQ qatorlarini ishlat.
4. Topilgan yozuvlar sonini ayt. Kerak bo'lsa 3-5 ta misol yozuvni qator raqami (#) bilan ko'rsat.
5. QIDIRUV «topilmadi» desa yoki izohda «to'liq mos yozuv yo'q» bo'lsa — buni ochiq ayt.
6. Savol noaniq bo'lsa (masalan qaysi oy ekanligi), qisqa aniqlashtiruvchi savol ber.
7. Summalarni bo'sh joy bilan yoz: 6 255 000 so'm.
8. SANA QOIDASI: yilni HECH QACHON aytma (2026 deb yozma). «Bugun» so'ralsa — «bugun», «kecha» so'ralsa — «kecha» deb ayt. Aniq sana so'ralsa yoki sanani ko'rsatish kerak bo'lsa — faqat kun va oyni ayt: «30-sentabr», «12-iyul».
9. TAHLIL/SHUBHA/NARX FARQI so'ralsa — «TAHLIL» blokidan foydalan. Narx farqi so'ralsa «BIR XIL MAHSULOT — HAR XIL NARX» ro'yxatidan eng muhim 3-6 mahsulotni ayt: eng arzon va eng qimmat narx, qator raqami (#), farq % va tejalishi mumkin bo'lgan summa. Shubha so'ralsa — 3-5 shubhali yozuvni # bilan, NIMA UCHUN shubhali ekanini (takroriy, narx baland, katta summa, hisob mos emas, mas'ul/izoh yo'q) qisqa tushuntir. Hech qachon «yozuv yo'q», «qaysi mahsulot?» deb qaytarma — TAHLIL bloki bor bo'lsa undan javob ber. Ayblama: «tekshirib ko'rish kerak» ohangida yoz.
10. MASLAHATNI FAQAT foydalanuvchi aynan «maslahat ber», «tavsiya ber» yoki «nima qilish kerak?» deb so'raganda ber. Oddiy savol, hisobot, tahlil, shubhali xarajat yoki narx farqi javobiga o'zingdan maslahat qo'shma. Maslahat so'ralsa, aniqlangan dalillarga tayangan 2-3 ta amaliy tavsiya ber.
11. Har bir savolga avval to'g'ridan-to'g'ri xulosa bilan javob ber. Bir savoldagi loyihalar, oylar, summalar va birliklarni aralashtirma; har birini alohida qatorda aniq nomla. Ma'lumot yetmasa taxmin qilma, aynan qaysi ma'lumot yetishmasligini bitta jumlada ayt.
12. «Qo'shimcha yozuv», «boshqa yozuvlar ham bor», «shu davrdagi barcha yozuvlar berildi» kabi iboralarni YOZMA va javobga so'ralmagan qo'shimcha yozuvlarni qo'shma — faqat so'ralgan narsaga javob ber. Bir xil son yoki summani javobda ikki marta takrorlama: jami aytilgan bo'lsa, qayta yozma.
${voice ? "OVOZ: 1-3 jumla, markdown yo'q. Summani O'ZBEKCHA TO'LIQ SO'Z BILAN, yagona ibora qilib ayt: «7 686 000 so'm → yetti million olti yuz sakson ming so'm», «6 255 000 so'm → olti million ikki yuz ellik besh ming so'm». «Sum/so'm» so'zini faqat ENG OXIRIDA 1 marta ayt, har bir qismdan keyin takrorlama (hech qachon «7 million sum 680 ming sum» kabi ajratma). Raqamlarni raqam bilan emas, so'z bilan o'qiydigan ko'rinishda yoz." : "YOZMA JAVOB: telefon ekraniga mos, tartibli va ixcham yoz. Jadval ishlatma. Birinchi qatorda aniq javob yoki xulosa bo'lsin. Keyin kerak bo'lsa qisqa sarlavha va har bir faktni alohida • belgili qatorda yoz. 2-8 qator yetarli; asosiy summa yoki natijani **bold** qil. Bir fikrni takrorlama, uzun tartibsiz paragraf yozma."}

JADVAL MA'LUMOTLARI:
${ctx}`;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: system },
          ...prev.slice(-6),
          { role: "user", content: question },
        ],
      }),
    });
    if (res.status === 429) return "⚠️ AI band. Bir oz kutib qayta so'rang.";
    if (res.status === 402) return "⚠️ AI krediti tugagan.";
    if (!res.ok) return `⚠️ AI xatosi: ${res.status}`;
    const j: any = await res.json();
    return String(j?.choices?.[0]?.message?.content ?? "").trim() || "🤔 Javob bo'sh.";
  } catch (e: any) {
    return `⚠️ Tarmoq xatosi: ${e?.message ?? e}`;
  }
}

// Markdown → Telegram HTML (sodda)
function mdToHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

// ---------- Sessiya ----------
type Session = {
  chat_id: number;
  telegram_user_id: number;
  username: string | null;
  flow: string | null;
  step: string | null;
  data: any;
};
async function getSession(chat_id: number, uid: number, username: string | null): Promise<Session> {
  const sb = admin();
  const { data } = await sb.from("telegram_sessions").select("chat_id,telegram_user_id,username,flow,step,data").eq("chat_id", chat_id).maybeSingle();
  if (data) return data as Session;
  const fresh: Session = { chat_id, telegram_user_id: uid, username, flow: null, step: null, data: { draft: [] } };
  await sb.from("telegram_sessions").upsert(fresh);
  return fresh;
}
const saveSession = (s: Session) =>
  admin().from("telegram_sessions").upsert({ ...s, updated_at: new Date().toISOString() });

function getDraft(s: Session): any[] {
  return Array.isArray(s.data?.draft) ? s.data.draft : [];
}

// ---------- Master katalog ----------
async function loadMaster(kind: "material" | "work") {
  const table = kind === "material" ? "master_materials" : "master_works";
  const { data } = await admin().from(table).select("id,name,unit,aliases").order("name");
  return data ?? [];
}

// ---------- Fayl yuklash ----------
async function uploadFile(file_id: string, prefix: string): Promise<{ url: string; dataUrl: string; bytes: Uint8Array; mime: string } | null> {
  try {
    const r = await fetch(`${TG_API}/getFile?file_id=${file_id}`).then((x) => x.json());
    const path = r?.result?.file_path;
    if (!path) return null;
    const fileRes = await fetch(`https://api.telegram.org/file/bot${TG_TOKEN}/${path}`);
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    const ext = (path.split(".").pop() || "bin").toLowerCase();
    const EXT_MIME: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
      gif: "image/gif", heic: "image/heic", bmp: "image/bmp", pdf: "application/pdf",
      oga: "audio/ogg", ogg: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav",
    };
    const hdrMime = (fileRes.headers.get("content-type") || "").split(";")[0].trim();
    const mime =
      EXT_MIME[ext] ??
      (hdrMime && hdrMime !== "application/octet-stream" ? hdrMime : "image/jpeg");

    const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const sb = admin();
    const { error } = await sb.storage.from("telegram-files").upload(key, buf, { contentType: mime });
    if (error) return null;
    const url = sb.storage.from("telegram-files").getPublicUrl(key).data.publicUrl;
    // Bucket private — AI public URL'ni ocholmaydi, shuning uchun base64 data URL ham qaytaramiz
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const dataUrl = `data:${mime};base64,${btoa(bin)}`;
    return { url, dataUrl, bytes: buf, mime };
  } catch {
    return null;
  }
}

// ---------- Lovable AI ----------
let lastAiError: string | null = null;

function aiErrorText(status: number, body: string): string {
  if (status === 402) return "AI krediti tugagan. Lovable workspace'da kredit to'ldiring.";
  if (status === 429) return "AI band (limit). Biroz kutib qayta urinib ko'ring.";
  return `AI xatolik (${status}): ${body.slice(0, 200)}`;
}

async function callAi(systemPrompt: string, userParts: any[], model = "google/gemini-2.5-flash"): Promise<any | null> {
  lastAiError = null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userParts },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("AI error", res.status, body);
      lastAiError = aiErrorText(res.status, body);
      return null;
    }
    const j = await res.json();
    const txt: string = j?.choices?.[0]?.message?.content ?? "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) { lastAiError = "AI javobini o'qib bo'lmadi."; return null; }
    return JSON.parse(m[0]);
  } catch (e) {
    console.error("ai parse", e);
    lastAiError = "AI bilan bog'lanib bo'lmadi.";
    return null;
  }
}


// UzbekVoice.ai STT — o'zbekcha ovozni matnga aylantirish
async function transcribeAudio(bytes: Uint8Array, mime: string): Promise<string | null> {
  const apiKey = process.env.AISHA_API_KEY;
  if (!apiKey) {
    console.error("[uzbekvoice] stt API kalit yo'q");
    return null;
  }
  try {
    const ext = mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : mime.includes("mp4") || mime.includes("m4a") ? "m4a" : "mp3";
    const form = new FormData();
    form.append("file", new Blob([bytes as unknown as BlobPart], { type: mime }), `voice.${ext}`);
    form.append("return_offsets", "false");
    form.append("run_diarization", "false");
    form.append("blocking", "true");
    form.append("language", "uz");
    const res = await fetch("https://uzbekvoice.ai/api/v1/stt", {
      method: "POST",
      headers: { Authorization: apiKey },
      body: form,
    });
    if (!res.ok) {
      console.error("[uzbekvoice] stt failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const j = (await res.json().catch(() => null)) as { result?: { text?: string } } | null;
    return (j?.result?.text ?? "").trim() || null;
  } catch (e) {
    console.error("[uzbekvoice] stt exception", e);
    return null;
  }
}

// ---------- AI prompt ----------
const SHEET_EXPENSE_CATEGORIES = [
  "Oziq-ovqat",
  "Qurilish materiallari",
  "Boshqa",
  "Yoqilg‘i",
  "Texnika",
  "oylik",
  "Texnika xavfsizligi",
  "Usta",
  "Yetkazib berish",
  "Ijara",
  "Transfer",
] as const;

function normalizeSheetCategory(category: unknown, description: unknown): string {
  const text = `${String(category ?? "")} ${String(description ?? "")}`.toLocaleLowerCase("uz");
  if (/transfer|podotchet|xodimga\s*berild/.test(text)) return "Transfer";
  if (/oziq|ovqat|non|ichimlik|obed|tushlik|kechki/.test(text)) return "Oziq-ovqat";
  if (/texnika\s*xavfsiz|xavfsizlik|siz|kaska|jilet|qo['‘’`]?lqop/.test(text)) return "Texnika xavfsizligi";
  if (/benzin|salyarka|dizel|yoqilg|metan|propan/.test(text)) return "Yoqilg‘i";
  if (/qurilish\s*material|material|sement|armatura|g['‘’`]?isht|beton|elektrod|izolenta/.test(text)) return "Qurilish materiallari";
  if (/yetkaz|dostav|transport/.test(text)) return "Yetkazib berish";
  if (/ijara|arenda/.test(text)) return "Ijara";
  if (/oylik|maosh|xodim/.test(text)) return "oylik";
  if (/usta|brigada|avans/.test(text)) return "Usta";
  if (/texnika|ekskavator|kran|traktor|moyka|remont/.test(text)) return "Texnika";
  return "Boshqa";
}

function autoPrompt(_materials: any[], _works: any[], categories: string[]) {
  const catList = categories.length ? categories.join(" | ") : "Boshqa";
  return `Sen qurilish loyihasining moliya yordamchisisan. Foydalanuvchi xabarini (matn/ovoz/rasm) o'qib HAR BIR yozuvni JSON qilib qaytar.

FAQAT 2 TUR (kind):
- "expense" — PUL CHIQIMI. Sotib olingan material, ovqat, benzin, texnika, usta puli, oylik, ijara — hammasi expense.
- "income" — KASSAGA PUL KELISHI: "kirim", "pul oldim", "pul keldi", "prixod", "приход", "kassaga tushdi", "to'lov keldi", "investitsiya", "mijoz to'ladi".

"ombor", "zayavka", "material qabul", "ish bajarildi" kabi turlar YO'Q. Hech qachon ishlatma.

HAR BIR expense uchun ANIQLA:
- name: mahsulot/xizmat nomi + MUHIM aniqlovchi. Qisqa bo'lsin, lekin quyidagilarni HECH QACHON tashlab yuborma:
  * TEXNIKA/MASHINA nomi aytilsa (Lacetti, Nexia, Damas, Kamaz, Greder, Ekskavator, Kran, Traktor, Pogruzchik, Betonmeshalka, Moyka...) — uni nomga qo'sh:
    "metan lacettiga 100 ming" → name = "Metan (Lacetti)"
    "ekskavatorga 80 litr salyarka" → name = "Salyarka (Ekskavator)"
  * SHAXS ISMI aytilsa (oylik, avans, ish haqi, usta puli) — ismni nomda saqla:
    "Golib greder 200000 oylik" → name = "G'olib (greder) — oylik"
    "Ozod ustaga 500 ming avans" → name = "Ozod usta — avans"
  * NIMA UCHUN / QAYERGA olingani aytilsa ("texnikaga benzin", "oshxonaga go'sht", "4-blokka sement", "lager uchun gaz") — maqsadni HECH QACHON tashlab ketma, qavsda yoz:
    "texnikaga benzin 300 ming" → name = "Benzin (texnika)"
    "oshxonaga 5 kg go'sht" → name = "Go'sht (oshxona)"
    "Kamazga balon 1,2 mln" → name = "Balon (Kamaz)"
  * Kategoriyani mahsulotga qarab tanla (benzin → yoqilg'i), lekin nomdagi maqsad/texnikani saqla.
- O'ZINGDAN SO'Z QO'SHMA: foydalanuvchi aytmagan so'zlarni ("haydovchisi", "ishchisi", "uchun", "xizmati") qo'shish QAT'IY TAQIQLANADI. Faqat aytilgan so'zlarni tozalab ishlat.
- Sana, "berildi", "olindi", "to'ladim" kabi fe'llarni nomga qo'shma.
- qty (son) va unit (birlik): dona, kg, litr, qop, m, m2, m3, tonna, reys, kun, soat. Aytilmasa qty=1, unit="dona".
- unit_price (dona narxi) va amount (umumiy summa).
  * Faqat umumiy summa aytilsa: amount = shu summa, unit_price = amount / qty.
  * Faqat dona narxi aytilsa ("10 qop 65 mingdan"): unit_price = 65000, amount = qty * unit_price.
  * Ikkalasi ham aytilsa, ular mos kelmasa — ishonchli bo'lgani umumiy summa: amount to'g'ri deb ol, unit_price = amount / qty.
- category: FAQAT shu ro'yxatdan: ${catList}. Mos kelmasa "Boshqa".
- payment_method: "bank/karta/plastik/o'tkazma/перевод" → "Bank", aks holda "Naqd".
- description: nomi + qisqa izoh (kim oldi, qayerga ketdi).

TRANSFER (ichki pul berish): "@jasur_prorab ga 5 mln berdim", "Jasurga 2 mln pul berdim (xarajat uchun)" — bu loyiha xarajati EMAS, xodimga pul o'tkazish:
  kind="expense", category="Transfer", name="Transfer → @jasur_prorab", paid_by="@jasur_prorab" (username yoki ism).
  Xodim o'zi "pul oldim" desa ham bu income EMAS — Transfer.
  Faqat mahsulot/xizmat sotib olinganda oddiy kategoriya ishlatiladi.

SALYARKA / YOQILG'I (alohida litr hisobi):
Agar xabarda texnikaga yoqilg'i (salyarka, dizel, solyarka) quyilgani yoki bazaga salyarka kelgani aytilsa, expense ichiga QO'SHIMCHA maydonlar qo'sh:
  fuel_tech — texnika nomi/raqami aynan aytilganidek ("Ekskavator 871", "Greyder 231", "Pogruzchik 060", "Kara 469").
  fuel_driver — haydovchi/mas'ul ismi aytilgan bo'lsa.
  fuel_liters — litr miqdori (son).
  fuel_type — "CHIQIM" (texnikaga quyildi) yoki "KIRIM" (bazaga salyarka keldi/olindi).
Misol: "Ekskavator 871 ga 100 litr salyarka — Javohir" → fuel_tech="Ekskavator 871", fuel_driver="Javohir", fuel_liters=100, fuel_type="CHIQIM", amount=0 (narx aytilmagan).
Agar narxi ham aytilsa ("100 litr 13 mingdan") — odatdagidek qty/unit_price/amount ni ham to'ldir.

SON O'QISH: "200ming"=200000, "2 mln"=2000000, "20k"=20000, "2,5 mln"=2500000. "besh yuz ming"=500000.
TIL: o'zbek (lotin/kirill), rus, ingliz. Imlo xatolari va qisqartmalarni o'zing tushun va to'g'rila.
Bitta xabarda bir nechta yozuv bo'lsa — har birini alohida item qil.
Umuman tushunmasang ham bitta expense qaytar: name = matnning o'zi, amount = topilgan son yoki 0.

Faqat JSON:
{"items":[
  {"kind":"expense","name":"...","qty":1,"unit":"dona","unit_price":0,"amount":0,"category":"Boshqa","payment_method":"Naqd","description":"...","paid_by":null,"fuel_tech":null,"fuel_driver":null,"fuel_liters":null,"fuel_type":null},
  {"kind":"income","amount":0,"payment_method":"Naqd","description":"...","payer":null}
]}`;

}

/** AI javobini bitta qat'iy shaklga keltiradi: faqat expense/income, son-birlik-summa mos. */
function normalizeItems(items: any[]): any[] {
  const out: any[] = [];
  for (const raw of items ?? []) {
    const it: any = { ...raw };
    if (it.kind === "income") {
      out.push({
        kind: "income",
        amount: Number(it.amount) || 0,
        payment_method: payMethod(`${it.payment_method ?? ""} ${it.description ?? ""}`),
        description: it.description ?? it.name ?? "Kirim",
        payer: it.payer ?? it.paid_by ?? null,
      });
      continue;
    }
    // Qolgan hamma narsa — xarajat
    const name = String(it.name ?? it.description ?? "Xarajat").trim() || "Xarajat";
    let qty = Number(it.qty);
    if (!Number.isFinite(qty) || qty <= 0) qty = 1;
    let unit = String(it.unit ?? "").trim() || "dona";
    let price = Number(it.unit_price) || 0;
    let amount = Number(it.amount) || 0;
    if (amount > 0 && price > 0) {
      // Nomuvofiqlik bo'lsa umumiy summa ustun
      if (Math.abs(qty * price - amount) > Math.max(1, amount * 0.02)) price = amount / qty;
    } else if (amount > 0 && price <= 0) {
      price = amount / qty;
    } else if (price > 0 && amount <= 0) {
      amount = qty * price;
    }
    const liters = Number(it.fuel_liters);
    out.push({
      kind: "expense",
      name,
      qty,
      unit,
      unit_price: Math.round(price),
      amount: Math.round(amount),
      category: normalizeSheetCategory(it.category, `${name} ${it.description ?? ""}`),
      payment_method: payMethod(`${it.payment_method ?? ""} ${it.description ?? ""}`),
      description: it.description ?? name,
      paid_by: it.paid_by ?? it.who ?? null,
      fuel_tech: it.fuel_tech ?? null,
      fuel_driver: it.fuel_driver ?? null,
      fuel_liters: Number.isFinite(liters) && liters > 0 ? liters : null,
      fuel_type: String(it.fuel_type ?? "").toUpperCase() === "KIRIM" ? "KIRIM" : "CHIQIM",
    });

  }
  return out;
}


// ---------- Render ----------
function fmtMoney(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("uz-UZ") : "—";
}
function parseMoneyNum(raw: string): number {
  let numStr = raw.replace(/[\s'`]/g, "");
  const hasComma = numStr.includes(",");
  const hasDot = numStr.includes(".");
  if (hasComma && hasDot) {
    const lastComma = numStr.lastIndexOf(",");
    const lastDot = numStr.lastIndexOf(".");
    numStr = lastComma > lastDot ? numStr.replace(/\./g, "").replace(",", ".") : numStr.replace(/,/g, "");
  } else if (hasComma) {
    const parts = numStr.split(",");
    numStr = parts.length > 2 || (parts.length === 2 && parts[1]!.length === 3) ? numStr.replace(/,/g, "") : numStr.replace(",", ".");
  } else if (hasDot) {
    const parts = numStr.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1]!.length === 3)) numStr = numStr.replace(/\./g, "");
  }
  const n = Number(numStr);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Matndagi pul summasini o'qiydi. Bir xil deb qabul qilinadi:
 * «130 m», «130m», «130 ming», «130 k», «130 sum/so'm», «130,000», «130 000», «130000» → 130 000.
 * Kichik son (<1000) yonida «sum/so'm» bo'lsa — ming deb olinadi (amalda 130 so'mlik xarajat yo'q).
 * Bir nechta son bo'lsa (masalan «10 qop 65 ming») — pul belgisi bor sonni afzal ko'radi.
 */
function parseMoney(text: string): number {
  const low = text.toLowerCase().replace(/[’‘ʼʻ`]/g, "'");
  const re = /(?<![a-zа-я\d.,])(\d[\d\s.,']*\d|\d)\s*(mlrd|milliard|миллиард|billion|bln|mln|million|млн|миллион|ming|минг|тыс|k(?![a-zа-я])|m(?![a-zа-я²³0-9])|so'?m|sum|сум|сўм)?/gi;
  let best = 0, bestScore = -1;
  for (const m of low.matchAll(re)) {
    const n = parseMoneyNum(m[1]!.trim());
    if (!n) continue;
    const unit = (m[2] ?? "").toLowerCase();
    let v = n, score = 0;
    if (/^(mlrd|milliard|миллиард|billion|bln)$/.test(unit)) { v = n * 1e9; score = 3; }
    else if (/^(mln|million|млн|миллион)$/.test(unit)) { v = n * 1e6; score = 3; }
    else if (/^(ming|минг|тыс|k|m)$/.test(unit)) { v = n * 1e3; score = 3; }
    else if (unit) { v = n < 1000 ? n * 1e3 : n; score = 3; } // sum / so'm
    else if (n >= 1000) score = 2; // 130000, 130,000, 130 000
    else score = 0; // yalang kichik son — ehtimol soni (10 qop)
    if (score > bestScore || (score === bestScore && v > best)) { best = v; bestScore = score; }
  }
  return best;
}
function isIncomeText(text: string) {
  return /\b(kirim|prixod|prexod|приход|pul\s*old|пул\s*олд|pul\s*keldi|kassaga|to'?lov\s*keldi|investitsiya|avans\s*old|mijoz\s*to'?la)/i.test(text);
}
function payMethod(text: string) {
  return /\b(bank|plastik|karta|o'?tkazma|hisob|перевод|карта)/i.test(text) ? "Bank" : "Naqd";
}
function renderItem(it: any, idx: number): string {
  const kind = it.kind ?? "expense";
  if (kind === "income") {
    const amount = Math.max(Number(it.amount) || 0, parseMoney(`${it.description ?? ""} ${it._source_note ?? ""}`));
    return `<b>${idx}. Kirim</b> — ${fmtMoney(amount)} so'm (${it.payment_method ?? "Naqd"})${it.description ? ` · ${it.description}` : ""}`;
  }
  const qty = Number(it.qty) || 1;
  const price = Number(it.unit_price) || 0;
  const amount = Number(it.amount) || qty * price;
  const name = it.name ?? it.description ?? "Xarajat";
  const detail = price > 0 && qty > 0 ? `${qty} ${it.unit ?? "dona"} × ${fmtMoney(price)} = ` : "";
  const cat = it.category ? ` [${it.category}]` : "";
  const liters = Number(it.fuel_liters) || 0;
  if (liters > 0) {
    const tech = it.fuel_tech ? ` · ${it.fuel_tech}` : "";
    const drv = it.fuel_driver ? ` · ${it.fuel_driver}` : "";
    const money = amount > 0 ? ` — <b>${fmtMoney(amount)}</b> so'm` : " (faqat litr)";
    return `<b>${idx}. ⛽ ${name}</b> — ${liters} l${tech}${drv}${money}`;
  }
  return `<b>${idx}. ${name}</b> — ${detail}<b>${fmtMoney(amount)}</b> so'm${cat}`;

}


// ---------- Saqlash ----------
async function persistDraft(session: Session): Promise<string> {
  const items: any[] = getDraft(session);
  const project_id = session.data?.project_id;
  if (!project_id) return "❌ Loyiha tanlanmagan.";
  if (!items.length) return "❌ Draft bo'sh.";
  const sb = admin();
  let ok = 0;
  const errs: string[] = [];
  const fuelEntries: Array<{ date: string; type: string; tech: string | null; driver: string | null; liters: number; note: string }> = [];


  // Tasdiqlash tugmasi 2 marta bosilsa yoki Telegram so'rovni qayta yuborsa —
  // draftni darhol tozalab qo'yamiz, shunda ikkinchi chaqiruv bo'sh draftni ko'radi.
  session.data = { ...session.data, draft: [] };
  await saveSession(session);

  const nullIfBad = (v: any) => {
    if (v == null) return null;
    const s = String(v).trim().toLowerCase();
    if (!s || s === "null" || s === "undefined" || s === "none") return null;
    return v;
  };

  // Normalize for fuzzy name matching (cyrillic→latin, lowercase, alnum only)
  const CYR_MAP: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",ғ:"g",д:"d",е:"e",ё:"yo",ж:"j",з:"z",и:"i",й:"y",
    к:"k",қ:"q",л:"l",м:"m",н:"n",ң:"ng",о:"o",ө:"o",ў:"o",п:"p",р:"r",с:"s",
    т:"t",у:"u",ф:"f",х:"x",ҳ:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sh",ъ:"",ы:"i",ь:"",
    э:"e",ю:"yu",я:"ya",
  };
  const norm = (s: string) => {
    if (!s) return "";
    let out = "";
    for (const ch of s.toLowerCase()) out += CYR_MAP[ch] ?? ch;
    return out.replace(/[^a-z0-9]+/g, "");
  };
  const sim = (a: string, b: string): number => {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.95;
    const bg = (s: string) => { const set = new Set<string>(); for (let i=0;i<s.length-1;i++) set.add(s.slice(i,i+2)); return set; };
    const A = bg(a), B = bg(b);
    if (!A.size || !B.size) return 0;
    let inter = 0; for (const x of A) if (B.has(x)) inter++;
    return (2 * inter) / (A.size + B.size);
  };

  // Helper: find approved zayavka by master_id OR by fuzzy name match
  async function findBoqLink(masterId: string | null, zk: "material" | "work", name?: string | null): Promise<{ zayavka_id: string | null; boq_item_id: string | null; boq_code: string | null }> {
    const empty = { zayavka_id: null as string | null, boq_item_id: null as string | null, boq_code: null as string | null };
    const col = zk === "material" ? "master_material_id" : "master_work_id";
    let z: any = null;

    if (masterId) {
      const { data: zs } = await sb
        .from("project_zayavka")
        .select("id, boq_item_id")
        .eq("project_id", project_id)
        .eq("kind", zk)
        .eq(col, masterId)
        .eq("status", "approved")
        .is("zayavka_no", null)
        .limit(1);
      z = (zs ?? [])[0];
    }

    // Fuzzy name fallback
    if (!z && name && name.trim()) {
      const { data: zs } = await sb
        .from("project_zayavka")
        .select("id, name, boq_item_id")
        .eq("project_id", project_id)
        .eq("kind", zk)
        .eq("status", "approved")
        .is("zayavka_no", null);
      const target = norm(name);
      if (target.length >= 3) {
        let best: any = null;
        let bestScore = 0;
        for (const r of (zs ?? []) as any[]) {
          const s = sim(target, norm(r.name ?? ""));
          if (s > bestScore) { bestScore = s; best = r; }
        }
        if (best && bestScore >= 0.7) z = best;
      }
    }

    if (!z) return empty;
    let boq_code: string | null = null;
    if (z.boq_item_id) {
      const { data: b } = await sb.from("boq_items").select("code").eq("id", z.boq_item_id).limit(1).maybeSingle();
      boq_code = (b as any)?.code ?? null;
    }
    return { zayavka_id: z.id, boq_item_id: z.boq_item_id ?? null, boq_code };
  }

  for (const it of items) {
    it.master_id = nullIfBad(it.master_id);
    let err: any = null;
    const kind = it.kind ?? "expense";
    const src = it._source ?? "telegram_text";
    const srcNote = it._source_note ?? null;
    if (kind === "zayavka") {
      const zk = it.z_kind === "work" ? "work" : "material";
      const link = await findBoqLink(it.master_id, zk as any, it.name);
      ({ error: err } = await sb.from("project_zayavka").insert({
        project_id,
        kind: zk as any,
        master_material_id: zk === "material" ? (it.master_id ?? null) : null,
        master_work_id: zk === "work" ? (it.master_id ?? null) : null,
        boq_item_id: link.boq_item_id ?? undefined,
        name: it.name ?? "Nomsiz",
        unit: it.unit ?? "dona",
        qty: Number(it.qty) || 0,
        unit_price: Number(it.unit_price) || 0,
        status: "approved" as any,
        workflow_status: "approved" as any,
        notes: it.notes ?? srcNote ?? null,
        off_plan: !!it.off_plan,
      }));
    } else if (kind === "material") {
      const link = await findBoqLink(it.master_id, "material", it.name);
      ({ error: err } = await sb.from("material_receipts").insert({
        project_id,
        master_material_id: it.master_id ?? null,
        material_name: it.name ?? "Noma'lum",
        qty: Number(it.qty) || 0,
        unit: it.unit ?? null,
        unit_price: Number(it.unit_price) || 0,
        supplier_name: it.supplier ?? null,
        zayavka_id: link.zayavka_id ?? undefined,
        boq_item_id: link.boq_item_id ?? undefined,
        boq_code: link.boq_code ?? undefined,
        telegram_user_id: session.telegram_user_id,
        source: src,
        source_note: srcNote,
      }));
    } else if (kind === "work") {
      const link = await findBoqLink(it.master_id, "work", it.name);
      ({ error: err } = await sb.from("work_progress").insert({
        project_id,
        master_work_id: it.master_id ?? null,
        work_type: it.name ?? "Noma'lum",
        qty_done: Number(it.qty) || 0,
        unit: it.unit ?? null,
        unit_price: Number(it.unit_price) || 0,
        brigade_name: it.brigade ?? it.who ?? null,
        zayavka_id: link.zayavka_id ?? undefined,
        boq_item_id: link.boq_item_id ?? undefined,
        boq_code: link.boq_code ?? undefined,
        telegram_user_id: session.telegram_user_id,
        source: src,
        source_note: srcNote,
      }));
    } else if (kind === "income") {
      const amount = Math.max(Number(it.amount) || 0, parseMoney(`${it.description ?? ""} ${it._source_note ?? ""}`));
      const _t = `${it.description ?? ""} ${it._source_note ?? ""} ${(it as any).category ?? ""}`.toLowerCase();
      const _isContract = /shartnom|kontrak|contract/.test(_t);
      ({ error: err } = await sb.from("incomes").insert({
        project_id,
        category: _isContract ? "Shartnoma" : payMethod(`${it.payment_method ?? ""} ${it.description ?? ""} ${it._source_note ?? ""}`),
        description: it.description ?? null,
        amount,
        payment_method: payMethod(`${it.payment_method ?? ""} ${it.description ?? ""} ${it._source_note ?? ""}`),
        payer: it.payer ?? it.paid_by ?? null,
        telegram_user_id: session.telegram_user_id,
        source: src,
        source_note: srcNote,
      }));
    } else {
      const qty = Number(it.qty) > 0 ? Number(it.qty) : 1;
      let amount = Number(it.amount) || 0;
      let price = Number(it.unit_price) || 0;
      if (!amount && price) amount = qty * price;
      if (!price && amount) price = amount / qty;
      const name = it.name ?? it.description ?? null;
      const liters = Number(it.fuel_liters) || 0;
      if (liters > 0) {
        fuelEntries.push({
          date: new Date().toISOString(),
          type: it.fuel_type === "KIRIM" ? "KIRIM" : "CHIQIM",
          tech: it.fuel_tech ?? null,
          driver: it.fuel_driver ?? it.paid_by ?? null,
          liters,
          note: amount > 0 ? `${name ?? "Salyarka"} — ${Math.round(amount).toLocaleString("uz-UZ")} so'm` : (name ?? ""),
        });
      }
      // Narx aytilmagan yoqilg'i yozuvi — faqat Salyarka jadvaliga, kassaga tegmaydi
      if (liters > 0 && amount <= 0) { ok++; continue; }
      ({ error: err } = await sb.from("expenses").insert({
        project_id,
        category: normalizeSheetCategory(it.category, `${name ?? ""} ${it._source_note ?? ""}`),
        description: name,
        amount: Math.round(amount),
        qty,
        unit: it.unit ?? "dona",
        unit_price: Math.round(price),
        payment_method: it.payment_method === "Bank" || it.payment_method === "Karta" ? it.payment_method : "Naqd",
        // Transfer: paid_by = oluvchi. Oddiy xarajat: kim yozgan bo'lsa o'sha (@username).
        paid_by: it.paid_by ?? it._author ?? tgAuthorTag(session.username),
        telegram_user_id: session.telegram_user_id,
        source: src,
        source_note: srcNote,
      }));
    }

    if (err) errs.push(err.message);
    else ok++;
  }
  let fuelNote = "";
  if (fuelEntries.length) {
    const r = await appendFuelEntries(fuelEntries);
    fuelNote = r.error
      ? `\n⚠️ Salyarka jadvaliga yozilmadi: ${r.error.slice(0, 120)}`
      : `\n⛽ Salyarka jadvaliga ${r.appended} ta yozuv qo'shildi`;
  }
  return `✅ <b>${ok}</b> ta yozuv Umumiy jadvalga saqlandi${fuelNote}${errs.length ? `\n⚠️ Xato: ${errs.length} (${errs[0]})` : ""}`;

}

// ---------- Loyiha tanlash ----------
async function showFirmPicker(chat_id: number) {
  // Firmalar tanlovi olib tashlandi — to'g'ridan-to'g'ri loyiha tanlanadi
  await showProjectPicker(chat_id, null);
}

/** Foydalanuvchiga biriktirilgan loyihani sessiyaga bog'laydi (tanlov tugmasi yo'q). */
async function bindAssignedProject(session: Session): Promise<boolean> {
  const sb = admin();
  const { data: prof } = await sb
    .from("profiles").select("id").eq("telegram_user_id", session.telegram_user_id).maybeSingle();
  if (!prof) return false;
  const { data: acc } = await sb
    .from("user_project_access").select("project_id").eq("user_id", (prof as any).id);
  const ids = (acc ?? []).map((r: any) => r.project_id);
  if (!ids.length) return false;
  const { data: projs } = await sb
    .from("projects").select("id,name").in("id", ids).eq("status", "active").order("name");
  const list = (projs ?? []) as Array<{ id: string; name: string }>;
  if (!list.length) return false;
  const cur = list.find((p) => p.id === session.data?.project_id) ?? list[0];
  session.data = { ...(session.data ?? {}), project_id: cur.id, project_name: cur.name };
  projectNameByChat.set(session.chat_id, cur.name);
  await saveSession(session);
  return true;
}

async function showProjectPicker(chat_id: number, _firm_id: string | null) {
  const s = await getSession(chat_id, 0, null);
  const ok = await bindAssignedProject(s);
  if (!ok) {
    await send(
      chat_id,
      "❌ Sizga loyiha biriktirilmagan.\nAdministrator sizni loyihaga biriktirgach ishlashingiz mumkin.",
      mainMenu(getDraft(s).length, chat_id),
    );
    return;
  }
  await send(chat_id, `🏗 Loyiha: <b>${s.data.project_name}</b>`, mainMenu(getDraft(s).length, chat_id));
}


// ---------- Smeta picker (material / ish / rejadan tashqari) ----------
function smetaScopeLabel(scope: "material" | "work" | "off_plan") {
  if (scope === "material") return { title: "📦 Materiallar (smeta)", emoji: "📦", action: "qabul qilindi" };
  if (scope === "work") return { title: "🔨 Ish turlari (smeta)", emoji: "🔨", action: "bajarildi" };
  return { title: "➕ Yordamchi (rejadan tashqari)", emoji: "➕", action: "amalga oshirildi" };
}

async function showSmetaPicker(chat_id: number, scope: "material" | "work" | "off_plan", project_id: string) {
  const sb = admin();
  let q = sb.from("project_zayavka")
    .select("id,name,unit,qty,unit_price,kind,off_plan,master_material_id,master_work_id")
    .eq("project_id", project_id).is("zayavka_no", null).is("parent_id", null)
    .order("name", { ascending: true }).limit(100);
  if (scope === "material") q = q.eq("kind", "material").eq("off_plan", false);
  else if (scope === "work") q = q.eq("kind", "work").eq("off_plan", false);
  else q = q.eq("off_plan", true);
  const { data, error } = await q;
  if (error) { await send(chat_id, `⚠️ Xatolik: ${error.message}`); return; }
  const items = (data ?? []) as any[];
  const meta = smetaScopeLabel(scope);
  if (!items.length) {
    await send(chat_id, `${meta.title}\n\n— bo'sh —`, smetaMenu());
    return;
  }

  // Ishlatilganlarni hisoblash
  const matMasterIds = items.filter((i) => i.kind === "material" && i.master_material_id).map((i) => i.master_material_id);
  const workMasterIds = items.filter((i) => i.kind === "work" && i.master_work_id).map((i) => i.master_work_id);
  const usedByMatMaster = new Map<string, number>();
  const usedByWorkMaster = new Map<string, number>();
  const usedByMatName = new Map<string, number>();
  const usedByWorkName = new Map<string, number>();

  if (matMasterIds.length) {
    const { data: mr } = await sb.from("material_receipts")
      .select("master_material_id,qty").eq("project_id", project_id).in("master_material_id", matMasterIds);
    for (const r of mr ?? []) {
      const k = (r as any).master_material_id as string;
      usedByMatMaster.set(k, (usedByMatMaster.get(k) ?? 0) + (Number((r as any).qty) || 0));
    }
  }
  if (workMasterIds.length) {
    const { data: wp } = await sb.from("work_progress")
      .select("master_work_id,qty_done").eq("project_id", project_id).in("master_work_id", workMasterIds);
    for (const r of wp ?? []) {
      const k = (r as any).master_work_id as string;
      usedByWorkMaster.set(k, (usedByWorkMaster.get(k) ?? 0) + (Number((r as any).qty_done) || 0));
    }
  }
  // master_id yo'qlar uchun nom bo'yicha
  const matNames = items.filter((i) => i.kind === "material" && !i.master_material_id).map((i) => i.name);
  const workNames = items.filter((i) => i.kind === "work" && !i.master_work_id).map((i) => i.name);
  if (matNames.length) {
    const { data: mr } = await sb.from("material_receipts")
      .select("material_name,qty").eq("project_id", project_id).in("material_name", matNames);
    for (const r of mr ?? []) {
      const k = String((r as any).material_name || "");
      usedByMatName.set(k, (usedByMatName.get(k) ?? 0) + (Number((r as any).qty) || 0));
    }
  }
  if (workNames.length) {
    const { data: wp } = await sb.from("work_progress")
      .select("work_type,qty_done").eq("project_id", project_id).in("work_type", workNames);
    for (const r of wp ?? []) {
      const k = String((r as any).work_type || "");
      usedByWorkName.set(k, (usedByWorkName.get(k) ?? 0) + (Number((r as any).qty_done) || 0));
    }
  }

  const map = new Map<string, SmetaPickItem>();
  const rows: { text: string }[][] = [];
  for (const it of items) {
    const isMat = it.kind === "material";
    const used = isMat
      ? (it.master_material_id ? (usedByMatMaster.get(it.master_material_id) ?? 0) : (usedByMatName.get(it.name) ?? 0))
      : (it.master_work_id ? (usedByWorkMaster.get(it.master_work_id) ?? 0) : (usedByWorkName.get(it.name) ?? 0));
    const plan = Number(it.qty) || 0;
    const left = Math.max(0, plan - used);
    const pct = plan > 0 ? Math.min(100, Math.round((used / plan) * 100)) : 0;
    const e = isMat ? "📦" : "🔨";
    const status = plan > 0 ? `${left}/${plan}${it.unit ? " " + it.unit : ""} · ${pct}%` : `${used}${it.unit ? " " + it.unit : ""}`;
    // Telegram reply-keyboard tugmasi 64 belgidan oshmasligi kerak — nomni qisqartiramiz
    const prefix = `${e} `;
    const suffix = ` — ${status}`;
    const maxNameLen = Math.max(8, 60 - prefix.length - suffix.length);
    const shortName = it.name.length > maxNameLen ? it.name.slice(0, maxNameLen - 1) + "…" : it.name;
    const label = `${prefix}${shortName}${suffix}`;
    map.set(label, {
      id: it.id, kind: it.kind, name: it.name, unit: it.unit || "dona",
      unit_price: Number(it.unit_price) || 0, qty_plan: plan, used,
      master_material_id: it.master_material_id ?? null,
      master_work_id: it.master_work_id ?? null,
      off_plan: !!it.off_plan,
    });
    rows.push([{ text: label }]);
  }
  rows.push([{ text: "↩️ Orqaga" }]);
  smetaPickByChat.set(chat_id, map);
  const s = await getSession(chat_id, 0, null);
  s.flow = `pick_smeta:${scope}`;
  s.data = { ...(s.data ?? {}), smeta_pick: null, smeta_scope: scope };
  await saveSession(s);
  await send(chat_id, `${meta.title} (${items.length} ta)\nTanlang — qabul/bajarilgan miqdorni kiriting:`, { keyboard: rows, resize_keyboard: true });
}


// ---------- AI qayta ishlash ----------
async function getPrompt() {
  const [mats, works] = await Promise.all([
    loadMaster("material"),
    loadMaster("work"),
  ]);
  return autoPrompt(mats, works, [...SHEET_EXPENSE_CATEGORIES]);
}

async function aiParse(text: string | null, imageUrl: string | null): Promise<any[]> {
  const prompt = await getPrompt();
  const parts: any[] = [];
  if (imageUrl) {
    parts.push({ type: "text", text: text || "Quyidagi rasmdagi yozuvlarni JSON ga ajrat:" });
    parts.push({ type: "image_url", image_url: { url: imageUrl } });
  } else {
    parts.push({ type: "text", text: text || "" });
  }
  const parsed = await callAi(prompt, parts, imageUrl ? "google/gemini-2.5-flash" : "google/gemini-2.5-flash");
  let items = Array.isArray(parsed?.items) ? parsed.items : [];
  const sourceText = text ?? "";
  // KIRIM override: agar matnda kirim/prixod/pul oldim... bo'lsa — XARAJAT EMAS, KIRIM sifatida saqlaymiz.
  if (sourceText && isIncomeText(sourceText)) {
    const amt = parseMoney(sourceText) || Number(items[0]?.amount) || Number(items[0]?.unit_price) || 0;
    const pm = payMethod(sourceText);
    items = [{
      kind: "income",
      amount: amt,
      payment_method: pm,
      description: (items[0]?.description as string) || "Kirim",
      payer: items[0]?.payer ?? items[0]?.who ?? null,
    }];
  }
  items = normalizeItems(items);
  // Summa tekshiruvi: matndagi sonni o'zimiz o'qiymiz ("102 ming" = "102,000" = 102000).
  // AI summa topmasa yoki "ming/mln" ni hisobga olmagan bo'lsa (102 ming → 102 deb o'qisa) — tuzatamiz.
  if (items.length === 1 && items[0].kind === "expense" && sourceText) {
    const amt = parseMoney(sourceText);
    if (amt > 0) {
      const aiAmt = Number(items[0].amount) || 0;
      const unitMismatch = aiAmt > 0 && aiAmt < amt && ((amt % aiAmt === 0 && amt / aiAmt >= 1000) || (aiAmt < 1000 && amt >= 1000));
      if (aiAmt <= 0 || unitMismatch) {
        items[0].amount = amt;
        items[0].unit_price = Math.round(amt / (items[0].qty || 1));
      }
    }
  }
  return items;
}


async function addToDraft(session: Session, newItems: any[], sourceMeta: { source: string; note: string }) {
  if (!newItems.length) {
    const err = lastAiError ? `\n\n⚠️ ${lastAiError}` : "";
    await send(session.chat_id, `⚠️ Tushuna olmadim. Aniqroq yozing.${err}`, mainMenu(getDraft(session).length, session.chat_id));
    return;
  }
  const tagged = newItems.map((it) => ({ ...it, _source: sourceMeta.source, _source_note: sourceMeta.note }));
  const editIndex = typeof session.data?.edit_index === "number" ? session.data.edit_index : null;
  let draft = getDraft(session);
  let confirmMsg: string;
  if (editIndex !== null && editIndex >= 0 && editIndex < draft.length) {
    // Replace at edit_index with the FIRST parsed item
    draft = [...draft];
    draft[editIndex] = tagged[0];
    confirmMsg = `✏️ #${editIndex + 1} yangilandi`;
    session.flow = null;
    session.data = { ...session.data, draft, edit_index: null };
  } else {
    draft = [...draft, ...tagged];
    confirmMsg = `Qo'shildi:\n${tagged.map((it, i) => renderItem(it, draft.length - tagged.length + i + 1)).join("\n")}`;
    session.data = { ...session.data, draft };
  }
  await saveSession(session);
  await send(session.chat_id, confirmMsg, mainMenu(draft.length, session.chat_id));
}

/**
 * Guruhlarda yig'ilgan yozuvlarni botning shaxsiy daftariga ko'chiradi.
 * Guruhda faqat «✅ Qabul qilindi» yoziladi, tasdiqlash shaxsiy chatda bo'ladi.
 */
async function mergeGroupDrafts(session: Session): Promise<number> {
  if (isGroupChat(session.chat_id)) return 0;
  const { data } = await admin()
    .from("telegram_sessions")
    .select("chat_id,data")
    .lt("chat_id", 0);
  const rows = (data ?? []) as Array<{ chat_id: number; data: any }>;
  const incoming: any[] = [];
  const clearIds: number[] = [];
  for (const r of rows) {
    const items = Array.isArray(r.data?.draft) ? r.data.draft : [];
    if (!items.length) continue;
    incoming.push(...items);
    clearIds.push(r.chat_id);
  }
  if (!incoming.length) return 0;
  // Guruh navbatini darhol bo'shatamiz — ikki marta ko'chirilmasligi uchun.
  for (const id of clearIds) {
    const row = rows.find((x) => x.chat_id === id);
    await admin()
      .from("telegram_sessions")
      .update({ data: { ...(row?.data ?? {}), draft: [] }, updated_at: new Date().toISOString() })
      .eq("chat_id", id);
  }
  session.data = { ...(session.data ?? {}), draft: [...getDraft(session), ...incoming] };
  await saveSession(session);
  return incoming.length;
}

async function showDaftar(session: Session, replaceMessageId?: number, mode: "view" | "edit" | "del" = "view") {
  if (mode === "view") await mergeGroupDrafts(session);
  const draft = getDraft(session);
  const chat_id = session.chat_id;
  if (!draft.length) {
    const text = "<b>Daftar bo'sh.</b>\nXarajatni yozing yoki ovoz/rasm yuboring.";
    if (replaceMessageId) await editText(chat_id, replaceMessageId, text);
    else await send(chat_id, text, mainMenu(0, chat_id));
    return;
  }
  const lines = draft.map((it, i) => renderItem(it, i + 1));
  const total = draft.reduce((s, it) => s + (it.kind === "income" ? 0 : Number(it.amount) || 0), 0);
  const buttons: any[] = [];
  if (mode === "view") {
    buttons.push([
      { text: "✅ Tasdiqlash", callback_data: "draft:confirm" },
      { text: "❌ Bekor qilish", callback_data: "draft:clear" },
    ]);
    buttons.push([
      { text: "Tahrirlash", callback_data: "daftar:pick:edit" },
      { text: "O'chirish", callback_data: "daftar:pick:del" },
    ]);
  } else {
    // Pick a row: show 1..N as a grid (max 4 per row)
    const cb = mode === "edit" ? "item:edit:" : "item:del:";
    let row: any[] = [];
    for (let i = 0; i < draft.length; i++) {
      row.push({ text: `${i + 1}`, callback_data: `${cb}${i}` });
      if (row.length === 4) { buttons.push(row); row = []; }
    }
    if (row.length) buttons.push(row);
    buttons.push([{ text: "↩️ Orqaga", callback_data: "daftar:view" }]);
  }
  const hint = mode === "view"
    ? `<b>Jami: ${fmtMoney(total)} so'm</b>`
    : mode === "edit"
      ? "<i>Tahrirlanadigan yozuv raqamini tanlang.</i>"
      : "<i>O'chiriladigan yozuv raqamini tanlang.</i>";
  const body = `<b>Daftar — ${draft.length} ta yozuv</b>\n\n${lines.join("\n")}\n\n${hint}`;
  if (replaceMessageId) await editText(chat_id, replaceMessageId, body, { inline_keyboard: buttons });
  else await send(chat_id, body, { inline_keyboard: buttons });
}
const showDraft = showDaftar;

/**
 * Daftarni buyruq bilan tahrirlash (matn yoki ovoz):
 * "3-qatorni o'chir", "2-yozuv summasi 150 ming", "1 qatorda 10 qop emas 12 qop".
 * true qaytarsa — buyruq bajarildi.
 */
function isEditIntent(t: string): boolean {
  return /o['‘’`]?chir|tahrir|o['‘’`]?zgartir|o['‘’`]?zgart|almashtir|to['‘’`]?g['‘’`]?rila|tuzat|emas|bo['‘’`]?lsin|удал|измен|исправ|замен/.test(t);
}

async function tryDaftarCommand(session: Session, text: string): Promise<boolean> {
  const draft = getDraft(session);
  if (!draft.length || !text) return false;
  const t = text.toLocaleLowerCase("uz");
  // Tahrir niyati bo'lsa yetarli — qator raqami shart emas.
  // "30 mingni 350 ming ozgartir", "benzinni 350 ming qil", "oxirgisini o'chir".
  if (!isEditIntent(t)) return false;

  const list = draft.map((it, i) => ({ n: i + 1, kind: it.kind ?? "expense", name: it.name ?? it.description, qty: it.qty, unit: it.unit, unit_price: it.unit_price, amount: it.amount, category: it.category, payment_method: it.payment_method }));
  const res = await callAi(
    `Sen daftar tahrirlovchisan. Foydalanuvchi daftardagi yozuvni tahrirlash yoki o'chirishni so'raydi.
Daftar (n — qator raqami): ${JSON.stringify(list)}
Ruxsat etilgan kategoriyalar: ${SHEET_EXPENSE_CATEGORIES.join(" | ")}
QATORNI ANIQLASH: foydalanuvchi qator raqamini aytmasligi mumkin. U holda qatorni shu belgilardan top:
- eski summa yoki narx bo'yicha ("30 mingni 350 ming qil" → amount yoki unit_price = 30000 bo'lgan qator),
- nomi bo'yicha ("benzinni 350 ming qil" → name ichida "benzin" bor qator),
- "oxirgisi"/"oxirgi yozuv" → eng katta n, "birinchisi" → n=1,
- daftarda faqat bitta qator bo'lsa — o'sha qator.
Bir nechta qator mos kelsa, eng oxirgisini (katta n) tanla. Hech biri mos kelmasa — bo'sh actions qaytar.
Qoidalar: faqat so'ralgan maydonlarni o'zgartir. Son o'zgarsa va dona narxi ma'lum bo'lsa amount = qty*unit_price qayta hisobla; faqat summa o'zgarsa unit_price = amount/qty. "200ming"=200000, "2 mln"=2000000.
Faqat JSON: {"actions":[{"action":"delete"|"edit","n":1,"changes":{"name"?:"","qty"?:0,"unit"?:"","unit_price"?:0,"amount"?:0,"category"?:"","payment_method"?:"Naqd"|"Bank","kind"?:"expense"|"income"}}]}
Agar bu tahrir buyrug'i bo'lmasa: {"actions":[]}`,
    [{ type: "text", text }],
  );
  const actions: any[] = Array.isArray(res?.actions) ? res.actions : [];
  if (!actions.length) return false;

  const next = [...draft];
  const done: string[] = [];
  const dels = new Set<number>();
  for (const a of actions) {
    const idx = Number(a?.n) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= draft.length) continue;
    if (a.action === "delete") { dels.add(idx); done.push(`#${idx + 1} o'chirildi`); continue; }
    if (a.action === "edit" && a.changes && typeof a.changes === "object") {
      const merged = { ...next[idx], ...a.changes };
      if (a.changes.name) merged.description = a.changes.name;
      if (a.changes.qty != null && a.changes.amount == null && Number(merged.unit_price) > 0) merged.amount = Number(merged.qty) * Number(merged.unit_price);
      if (a.changes.amount != null && a.changes.unit_price == null) merged.unit_price = 0;
      const [norm] = normalizeItems([merged]);
      next[idx] = { ...next[idx], ...norm, _source: next[idx]._source, _source_note: next[idx]._source_note };
      done.push(`#${idx + 1} tahrirlandi`);
    }
  }
  if (!done.length) return false;
  const finalDraft = next.filter((_, i) => !dels.has(i));
  session.flow = null;
  session.data = { ...session.data, draft: finalDraft, edit_index: null };
  await saveSession(session);
  await send(session.chat_id, `✏️ ${done.join(", ")}.`, mainMenu(finalDraft.length, session.chat_id));
  await showDaftar(session);
  return true;
}

// ============================================================
// 💼 BUXGALTERIYA — Zayavka button-flow
// ============================================================

const UNITS = ["dona", "m", "m²", "kg", "qop"];

function dateLabel(d: string) {
  const today = new Date();
  const y = (today.toISOString().slice(0, 10));
  const yest = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  if (d === y) return `Bugun (${d})`;
  if (d === yest) return `Kecha (${d})`;
  return d;
}

function getFlowState<T = any>(s: Session, key: string, fallback: T): T {
  return s.data?.[key] ?? fallback;
}
function setFlowState<T>(s: Session, key: string, st: T) {
  s.data = { ...(s.data ?? {}), [key]: st };
}
const bzGetState = (s: Session) =>
  getFlowState(s, "bz", { step: null, project_id: null, project_name: null, date: null, items: [], cur: {} } as any);
const bzSetState = (s: Session, st: any) => setFlowState(s, "bz", st);

async function bzShowProjects(chat_id: number) {
  const { data } = await admin().from("projects").select("id,name,code").eq("status", "active").order("name").limit(40);
  const list = data ?? [];
  if (!list.length) {
    await send(chat_id, "❌ Faol loyiha yo'q.", mainMenu(0, chat_id));
    return;
  }
  const buttons = list.map((p: any) => [{ text: `🏗 ${p.name}${p.code ? ` (${p.code})` : ""}`, callback_data: `bz:proj:${p.id}` }]);
  buttons.push([{ text: "↩️ Bekor", callback_data: "bz:cancel" }]);
  await send(chat_id, "🏗 <b>Loyiha tanlang:</b>", { inline_keyboard: buttons });
}

async function bzStart(session: Session) {
  const today = new Date().toISOString().slice(0, 10);
  const st = { step: "items_input", project_id: null, project_name: null, date: today, items: [], cur: {} };
  bzSetState(session, st);
  session.flow = "bux_zayavka";
  await saveSession(session);
  await send(session.chat_id,
    `📝 <b>Buyurtma — erkin yuboring</b>\n\nMatn yoki 🎤 ovoz orqali <b>loyiha nomi</b>, materiallar, miqdor, joy, izohlarni ayting.\nSana avtomatik (${today}) qo'yiladi.\n\n<i>Misol:</i>\n«Yunusobod loyihasi uchun 50 qop sement, 200 dona g'isht 1-qavatga, 3 m³ qum kerak»`,
    { inline_keyboard: [[{ text: "↩️ Bekor", callback_data: "bz:cancel" }]] });
}

// AI: erkin matn/ovozdan zayavka qatorlarini ajratish
async function aiParseZayavkaItems(text: string): Promise<any[]> {
  const sys = `Sen qurilish zayavka yordamchisisan. Foydalanuvchi matnida sanab o'tilgan materiallarni JSON ro'yxatga ajrat.
Har bir item: { "name": "material nomi", "unit": "dona|m|m²|kg|qop|m3|litr|tonna", "qty": son, "location": "joy yoki null", "notes": "qo'shimcha izoh yoki null" }.
- Birlik aniq bo'lmasa "dona".
- Joy/izoh aytilmagan bo'lsa null.
- Bitta material — bitta item. Vergul/yoki "va" bilan ajratilgan ro'yxatlarni alohida itemlarga bo'l.
Faqat JSON: {"items":[...]}`;
  const r = await callAi(sys, [{ type: "text", text }], "google/gemini-2.5-flash");
  const items = Array.isArray(r?.items) ? r.items : [];
  return items.map((it: any) => ({
    name: String(it.name ?? "").trim(),
    unit: String(it.unit ?? "dona").trim() || "dona",
    qty: Number(it.qty) || 0,
    location: it.location ?? null,
    notes: it.notes ?? null,
  })).filter((it: any) => it.name && it.qty > 0);
}

async function bzAskItems(session: Session) {
  const st = bzGetState(session);
  st.step = "items_input";
  bzSetState(session, st);
  await saveSession(session);
  await send(session.chat_id,
    `📝 <b>Buyurtma — detallarni yuboring</b>\n\nMatn yoki 🎤 ovoz orqali materiallar, miqdor, joy, izohlarni erkin ayting.\n\n<i>Misol:</i>\n«50 qop sement, 200 dona g'isht 1-qavat uchun, 3 m³ qum kerak»\n\nAI tushunadi va tasdiq so'raydi.`,
    { inline_keyboard: [
        [{ text: "↩️ Bekor", callback_data: "bz:cancel" }],
      ] });
}

function bzPreview(st: any): string {
  const head = `📋 <b>Buyurtma — Tasdiqlang</b>\n🏗 ${st.project_name ?? "—"}\n📅 ${dateLabel(st.date ?? "")}\n\nAI quyidagini tushundi:\n\n`;
  const lines = (st.items as any[]).map((it, i) =>
    `<b>${i + 1}.</b> ${it.name} — ${it.qty} ${it.unit} · 📍 ${it.location ?? "—"}${it.notes ? ` · 📝 ${it.notes}` : ""}`
  ).join("\n");
  return head + (lines || "(bo'sh)");
}

async function bzShowPreview(session: Session) {
  const st = bzGetState(session);
  st.step = "confirm";
  bzSetState(session, st);
  await saveSession(session);
  await send(session.chat_id, bzPreview(st), {
    inline_keyboard: [
      [{ text: "✅ Tasdiqlash", callback_data: "bz:confirm" }],
      [{ text: "➕ Yana qator", callback_data: "bz:more:yes" }, { text: "❌ Bekor", callback_data: "bz:cancel" }],
    ],
  });
}

async function bzGetSetting(key: string): Promise<string | null> {
  const { data } = await admin().from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data as any)?.value ?? null;
}

async function bzBuildExcel(opts: {
  project: { name: string; code?: string | null; pm_name?: string | null; prorab_name?: string | null };
  zayavka_no: number;
  date: string;
  items: any[];
  company: string;
}): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const aoa: any[][] = [];
  aoa.push([opts.company]);
  aoa.push([`Loyiha: ${opts.project.name}${opts.project.code ? ` (${opts.project.code})` : ""}`]);
  aoa.push([`Zayavka №: ${opts.zayavka_no}`, "", "", `Sana: ${opts.date}`]);
  aoa.push([]);
  aoa.push(["№", "Material nomi", "Birlik", "Miqdori", "Joy", "Izoh"]);
  opts.items.forEach((it, i) => {
    aoa.push([i + 1, it.name ?? "", it.unit ?? "", Number(it.qty) || 0, it.location ?? "", it.notes ?? ""]);
  });
  aoa.push([]);
  aoa.push(["", "", "", "", "Prorab:", opts.project.prorab_name ?? "________"]);
  aoa.push(["", "", "", "", "PM:", opts.project.pm_name ?? "________"]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 24 }];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Zayavka");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(out);
}

async function bzSendDocument(chat_id: number, bytes: Uint8Array, filename: string, caption: string) {
  const fd = new FormData();
  fd.append("chat_id", String(chat_id));
  fd.append("caption", caption);
  fd.append("parse_mode", "HTML");
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([ab], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  fd.append("document", blob, filename);
  await fetch(`${TG_API}/sendDocument`, { method: "POST", body: fd });
}

async function bzPersist(session: Session) {
  const st = bzGetState(session);
  const sb = admin();
  if (!st.project_id || !(st.items?.length)) {
    await send(session.chat_id, "❌ Loyiha yoki qatorlar bo'sh.", mainMenu(0, session.chat_id));
    return;
  }

  // Auto-number per project
  const { data: maxRow } = await sb
    .from("project_zayavka")
    .select("zayavka_no")
    .eq("project_id", st.project_id)
    .not("zayavka_no", "is", null)
    .order("zayavka_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextNo = ((maxRow as any)?.zayavka_no ?? 0) + 1;

  // Header row in project_zayavka
  const firstItem = st.items[0];
  const { data: header, error: headErr } = await sb
    .from("project_zayavka")
    .insert({
      project_id: st.project_id,
      kind: "material" as any,
      name: `Buyurtma #${nextNo}`,
      unit: firstItem?.unit ?? "dona",
      qty: 0,
      unit_price: 0,
      status: "approved" as any,
      workflow_status: "approved" as any,
      notes: `Telegram bot — ${st.date}`,
      zayavka_no: nextNo,
      telegram_user_id: session.telegram_user_id,
    } as any)
    .select("id")
    .single();
  if (headErr || !header) {
    await send(session.chat_id, `❌ Saqlash xatosi: ${headErr?.message ?? "?"}`, mainMenu(0, session.chat_id));
    return;
  }

  // Items
  const itemsPayload = (st.items as any[]).map((it, i) => ({
    zayavka_id: header.id,
    line_no: i + 1,
    name: it.name,
    unit: it.unit ?? "dona",
    qty: Number(it.qty) || 0,
    location: it.location ?? null,
    notes: it.notes ?? null,
  }));
  await sb.from("project_zayavka_items").insert(itemsPayload);

  // Project info for Excel footer
  const { data: proj } = await sb
    .from("projects")
    .select("name,code,pm_name,prorab_name")
    .eq("id", st.project_id)
    .maybeSingle();

  const company = (await bzGetSetting("company_name")) ?? 'FORTIGEN MCHJ';
  const bytes = await bzBuildExcel({
    project: (proj as any) ?? { name: st.project_name ?? "—" },
    zayavka_no: nextNo,
    date: st.date ?? new Date().toISOString().slice(0, 10),
    items: st.items as any[],
    company,
  });

  const filename = `buyurtma-${nextNo}-${st.date}.xlsx`;

  // Upload Excel to storage so web Buxgalteriya/Hujjatlar tab can show it
  let excelUrl: string | null = null;
  try {
    const key = `buyurtma/${st.project_id}/${Date.now()}-${filename}`;
    await sb.storage.from("nakladnoy").upload(key, bytes, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    excelUrl = sb.storage.from("nakladnoy").getPublicUrl(key).data.publicUrl;
    await sb.from("project_zayavka").update({ excel_url: excelUrl } as any).eq("id", header.id);
  } catch (e) {
    console.error("excel upload failed:", e);
  }

  const caption = `📋 <b>Buyurtma #${nextNo}</b>\n🏗 ${(proj as any)?.name ?? st.project_name}\n📅 ${st.date}\n📦 ${st.items.length} qator`;
  await bzSendDocument(session.chat_id, bytes, filename, caption);

  // Send to accounting chat
  const accId = await bzGetSetting("accounting_chat_id");
  if (accId) {
    const aid = Number(accId);
    if (Number.isFinite(aid)) {
      await bzSendDocument(aid, bytes, filename, caption + `\n\n👤 @${session.username ?? session.telegram_user_id}`);
    }
  }

  // Reset bz state
  session.flow = null;
  session.data = { ...(session.data ?? {}), bz: null };
  await saveSession(session);
  await send(session.chat_id, `✅ Buyurtma #${nextNo} saqlandi va yuborildi.`, mainMenu(getDraft(session).length, session.chat_id));
}

// ============================================================
// 📄 SHARTNOMA — ketma-ket flow
// ============================================================
type ShState = { step: string; supplier: string | null; contract_no: string | null; contract_date: string | null; amount: number | null; note: string | null; file_url: string | null };

const shGet = (s: Session): ShState =>
  getFlowState<ShState>(s, "sh", { step: "supplier", supplier: null, contract_no: null, contract_date: null, amount: null, note: null, file_url: null });
const shSet = (s: Session, st: ShState) => setFlowState(s, "sh", st);

async function shStart(session: Session) {
  shSet(session, { step: "supplier", supplier: null, contract_no: null, contract_date: null, amount: null, note: null, file_url: null });
  session.flow = "bux_shartnoma";
  await saveSession(session);
  await send(session.chat_id, "📄 <b>Shartnoma — yangi yozuv</b>\n\n1️⃣ <b>Kompaniya nomi</b> (yetkazib beruvchi)?",
    { inline_keyboard: [[{ text: "↩️ Bekor", callback_data: "sh:cancel" }]] });
}

async function shHandle(session: Session, msg: any, text: string) {
  const chat_id = session.chat_id;
  const st = shGet(session);
  // PDF/document upload
  if (msg.document && st.step === "file") {
    const fid = msg.document.file_id;
    const f = await uploadFile(fid, `shartnoma`);
    if (!f) { await send(chat_id, "❌ Fayl yuklanmadi. Qayta yuboring."); return; }
    try {
      const ext = (msg.document.file_name ?? "shartnoma.pdf").split(".").pop() || "pdf";
      const key = `shartnoma/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const sb = admin();
      await sb.storage.from("nakladnoy").upload(key, f.bytes, { contentType: f.mime || "application/pdf" });
      st.file_url = sb.storage.from("nakladnoy").getPublicUrl(key).data.publicUrl;
    } catch { st.file_url = f.url; }
    st.step = "note";
    shSet(session, st); await saveSession(session);
    await send(chat_id, "✅ Fayl saqlandi.\n\n6️⃣ <b>Izoh</b>? (yo'q bo'lsa «-»)", { inline_keyboard: [[{ text: "↩️ Bekor", callback_data: "sh:cancel" }]] });
    return;
  }

  if (!text) { await send(chat_id, "ℹ️ Matn yuboring."); return; }

  if (st.step === "supplier") {
    st.supplier = text; st.step = "contract_no";
    shSet(session, st); await saveSession(session);
    await send(chat_id, `✅ Kompaniya: <b>${text}</b>\n\n2️⃣ <b>Shartnoma raqami</b>?`); return;
  }
  if (st.step === "contract_no") {
    st.contract_no = text; st.step = "contract_date";
    shSet(session, st); await saveSession(session);
    const today = new Date().toISOString().slice(0,10);
    await send(chat_id, `✅ №: <b>${text}</b>\n\n3️⃣ <b>Sana</b>? (YYYY-MM-DD yoki «bugun»)\nBugun: ${today}`); return;
  }
  if (st.step === "contract_date") {
    let d = text.toLowerCase();
    if (d === "bugun" || d === "today") d = new Date().toISOString().slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { await send(chat_id, "❌ Format: YYYY-MM-DD"); return; }
    st.contract_date = d; st.step = "amount";
    shSet(session, st); await saveSession(session);
    await send(chat_id, `✅ Sana: <b>${d}</b>\n\n4️⃣ <b>Shartnoma summasi</b> (so'mda)?`); return;
  }
  if (st.step === "amount") {
    const n = Number(text.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) { await send(chat_id, "❌ Raqam yuboring."); return; }
    st.amount = n; st.step = "file";
    shSet(session, st); await saveSession(session);
    await send(chat_id, `✅ Summa: <b>${fmtMoney(n)}</b>\n\n5️⃣ <b>Shartnoma PDF</b> faylini yuboring (yoki «-» — keyin yuklash uchun).`); return;
  }
  if (st.step === "file") {
    if (text === "-") {
      st.step = "note";
      shSet(session, st); await saveSession(session);
      await send(chat_id, "⏭ Fayl o'tkazib yuborildi.\n\n6️⃣ <b>Izoh</b>? (yo'q bo'lsa «-»)"); return;
    }
    await send(chat_id, "📎 PDF faylni yuboring yoki «-» yozing."); return;
  }
  if (st.step === "note") {
    st.note = text === "-" ? null : text;
    shSet(session, st); await saveSession(session);
    const sb = admin();
    // Find or create supplier
    let supplier_id: string | null = null;
    const { data: existing } = await sb.from("suppliers").select("id").ilike("name", st.supplier ?? "").maybeSingle();
    if (existing) supplier_id = (existing as any).id;
    else {
      const { data: created } = await sb.from("suppliers").insert({ name: st.supplier ?? "Noma'lum" } as any).select("id").single();
      supplier_id = (created as any)?.id ?? null;
    }
    const { error } = await sb.from("supplier_contracts").insert({
      supplier_id,
      supplier_name: st.supplier,
      contract_no: st.contract_no,
      contract_date: st.contract_date,
      amount: st.amount,
      file_url: st.file_url,
      note: st.note,
    } as any);
    if (error) { await send(chat_id, `❌ Saqlash xatosi: ${error.message}`, mainMenu(getDraft(session).length, session.chat_id)); session.flow = null; await saveSession(session); return; }
    session.flow = null;
    session.data = { ...(session.data ?? {}), sh: null };
    await saveSession(session);
    await send(chat_id, `✅ <b>Shartnoma saqlandi</b>\n🏢 ${st.supplier}\n№ ${st.contract_no} · 📅 ${st.contract_date}\n💰 ${fmtMoney(st.amount ?? 0)}${st.file_url ? "\n📎 Fayl yuklandi" : ""}`, mainMenu(getDraft(session).length, session.chat_id));
    return;
  }
}



// ============================================================
// 🚚 NAKLADNOY (Nakladnoy) — button-flow
// ============================================================
const NK_UNITS = ["dona", "m", "m²", "kg", "qop"];

const nkGetState = (s: Session) =>
  getFlowState(s, "nk", { step: null, project_id: null, project_name: null, date: null, supplier: null, nakladnoy_no: null, photo_url: null, photo_mime: null, items: [], cur: {} } as any);
const nkSetState = (s: Session, st: any) => setFlowState(s, "nk", st);

async function nkShowProjects(chat_id: number) {
  const { data } = await admin().from("projects").select("id,name,code").eq("status", "active").order("name").limit(40);
  const list = data ?? [];
  if (!list.length) { await send(chat_id, "❌ Faol loyiha yo'q.", mainMenu(0, chat_id)); return; }
  const buttons = list.map((p: any) => [{ text: `🏗 ${p.name}${p.code ? ` (${p.code})` : ""}`, callback_data: `nk:proj:${p.id}` }]);
  buttons.push([{ text: "↩️ Bekor", callback_data: "nk:cancel" }]);
  await send(chat_id, "🏗 <b>2/6 — Loyiha:</b>", { inline_keyboard: buttons });
}

async function nkStart(session: Session) {
  const today = new Date().toISOString().slice(0, 10);
  const st = { step: "input", project_id: null, project_name: null, date: today, supplier: null, nakladnoy_no: null, photo_url: null, photo_mime: null, items: [], cur: {} };
  nkSetState(session, st);
  session.flow = "bux_nakladnoy";
  await saveSession(session);
  await nkAskInput(session);
}

async function aiParseNakladnoy(text: string): Promise<{ supplier: string | null; nakladnoy_no: string | null; items: any[] }> {
  const sys = `Sen Nakladnoy (waybill) yordamchisisan. Foydalanuvchi matnida ta'minotchi nomi, hujjat raqami va materiallarni topib JSON qaytar.
Format: {"supplier":"nom yoki null","nakladnoy_no":"raqam yoki null","items":[{"name":"...","unit":"dona|m|m²|kg|qop|m3|litr|tonna","qty":son,"unit_price":narx_so'mda}]}.
- "5 qop sement 65000 dan" → name="sement", unit="qop", qty=5, unit_price=65000
- "ming"=1000, "mln"=1000000. Birlik aniq bo'lmasa "dona". Narx aytilmagan bo'lsa 0.
- Ta'minotchi yoki № aytilmagan bo'lsa null.
Faqat JSON.`;
  const r = await callAi(sys, [{ type: "text", text }], "google/gemini-2.5-flash");
  const items = Array.isArray(r?.items) ? r.items : [];
  return {
    supplier: r?.supplier ? String(r.supplier).trim() : null,
    nakladnoy_no: r?.nakladnoy_no ? String(r.nakladnoy_no).trim() : null,
    items: items.map((it: any) => ({
      name: String(it.name ?? "").trim(),
      unit: String(it.unit ?? "dona").trim() || "dona",
      qty: Number(it.qty) || 0,
      unit_price: Number(it.unit_price) || 0,
    })).filter((it: any) => it.name && it.qty > 0),
  };
}


async function nkAskInput(session: Session) {
  const st = nkGetState(session);
  st.step = "input";
  nkSetState(session, st);
  await saveSession(session);
  await send(session.chat_id,
    `🚚 <b>Nakladnoy — erkin yuboring</b>\n\n🖼 Hujjat rasmini hamda matn yoki 🎤 ovoz orqali ta'minotchi, №, materiallar (nom/miqdor/narx) ayting.\n\n<i>Misol:</i>\n«FORTIS dan, № 1234, 5 qop sement 65000 dan, 200 dona g'isht 1500 dan»\n\nRasm va matn alohida xabar bo'lsa ham bo'ladi.`,
    { inline_keyboard: [[{ text: "↩️ Bekor", callback_data: "nk:cancel" }]] });
}

function nkPreview(st: any): string {
  const items = (st.items as any[]) ?? [];
  const total = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  const head = `🚚 <b>Nakladnoy — Preview</b>\n📅 ${st.date}\n🏗 ${st.project_name ?? "—"}\n🏭 ${st.supplier ?? "—"}\n№ ${st.nakladnoy_no ?? "—"}\n🖼 Rasm: ${st.photo_url ? "✅" : "—"}\n\n`;
  const lines = items.map((it, i) => {
    const sub = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
    return `<b>${i + 1}.</b> ${it.name} — ${it.qty} ${it.unit} × ${fmtMoney(it.unit_price)} = <b>${fmtMoney(sub)}</b>`;
  }).join("\n");
  return head + (lines || "(bo'sh)") + `\n\n💰 <b>Jami: ${fmtMoney(total)} so'm</b>`;
}

async function nkShowPreview(session: Session) {
  const st = nkGetState(session);
  st.step = "confirm";
  nkSetState(session, st);
  await saveSession(session);
  await send(session.chat_id, nkPreview(st), {
    inline_keyboard: [
      [{ text: "✅ Tasdiqlash", callback_data: "nk:confirm" }],
      [{ text: "➕ Yana qator", callback_data: "nk:more:yes" }, { text: "❌ Bekor", callback_data: "nk:cancel" }],
    ],
  });
}

async function nkBuildPdf(opts: {
  photoBytes: Uint8Array | null;
  photoMime: string | null;
  date: string;
  project: string;
  supplier: string;
  nakladnoy_no: string;
  items: any[];
  company: string;
}): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Page 1: original photo
  const p1 = pdf.addPage([595, 842]);
  if (opts.photoBytes) {
    try {
      const img = (opts.photoMime ?? "").includes("png")
        ? await pdf.embedPng(opts.photoBytes)
        : await pdf.embedJpg(opts.photoBytes);
      const maxW = 555, maxH = 760;
      const r = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * r, h = img.height * r;
      p1.drawImage(img, { x: (595 - w) / 2, y: (842 - h) / 2, width: w, height: h });
    } catch {
      p1.drawText("(rasmni o'qib bo'lmadi)", { x: 50, y: 400, font, size: 14 });
    }
  } else {
    p1.drawText("(rasm yo'q)", { x: 50, y: 400, font, size: 14 });
  }

  // Page 2: structured data
  const p2 = pdf.addPage([595, 842]);
  let y = 800;
  const safe = (s: any) => String(s ?? "").replace(/[^\x20-\x7E]/g, "?");
  const draw = (t: string, o: any = {}) => {
    p2.drawText(safe(t), { x: o.x ?? 40, y, font: o.bold ? fontBold : font, size: o.size ?? 11, color: rgb(0, 0, 0) });
    if (!o.inline) y -= (o.size ?? 11) + 6;
  };
  draw(opts.company, { bold: true, size: 14 }); y -= 4;
  draw(`Nakladnoy No: ${opts.nakladnoy_no}`, { bold: true });
  draw(`Sana: ${opts.date}`);
  draw(`Loyiha: ${opts.project}`);
  draw(`Taminotchi: ${opts.supplier}`);
  y -= 8;
  draw("Materiallar:", { bold: true });
  p2.drawText("#", { x: 40, y, font: fontBold, size: 10 });
  p2.drawText("Nomi", { x: 65, y, font: fontBold, size: 10 });
  p2.drawText("Birlik", { x: 270, y, font: fontBold, size: 10 });
  p2.drawText("Miqdor", { x: 320, y, font: fontBold, size: 10 });
  p2.drawText("Narx", { x: 380, y, font: fontBold, size: 10 });
  p2.drawText("Jami", { x: 470, y, font: fontBold, size: 10 });
  y -= 14;
  let total = 0;
  for (let i = 0; i < opts.items.length; i++) {
    if (y < 60) break;
    const it = opts.items[i];
    const sub = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
    total += sub;
    p2.drawText(String(i + 1), { x: 40, y, font, size: 10 });
    p2.drawText(safe(it.name).slice(0, 35), { x: 65, y, font, size: 10 });
    p2.drawText(safe(it.unit), { x: 270, y, font, size: 10 });
    p2.drawText(String(Number(it.qty) || 0), { x: 320, y, font, size: 10 });
    p2.drawText(String(Number(it.unit_price) || 0), { x: 380, y, font, size: 10 });
    p2.drawText(String(sub), { x: 470, y, font, size: 10 });
    y -= 14;
  }
  y -= 10;
  p2.drawText(`JAMI: ${total}`, { x: 40, y, font: fontBold, size: 13 });

  return await pdf.save();
}

async function nkSendPdf(chat_id: number, bytes: Uint8Array, filename: string, caption: string) {
  const fd = new FormData();
  fd.append("chat_id", String(chat_id));
  fd.append("caption", caption);
  fd.append("parse_mode", "HTML");
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  fd.append("document", new Blob([ab], { type: "application/pdf" }), filename);
  await fetch(`${TG_API}/sendDocument`, { method: "POST", body: fd });
}

async function nkPersist(session: Session) {
  const st = nkGetState(session);
  const sb = admin();
  if (!st.project_id || !(st.items?.length)) {
    await send(session.chat_id, "❌ Loyiha yoki qatorlar bo'sh.", mainMenu(0, session.chat_id));
    return;
  }

  // Re-fetch original photo bytes (for embedding into PDF)
  let photoBytes: Uint8Array | null = null;
  let photoMime: string | null = st.photo_mime ?? null;
  if (st.photo_url) {
    try {
      const r = await fetch(st.photo_url);
      photoBytes = new Uint8Array(await r.arrayBuffer());
      photoMime = photoMime ?? r.headers.get("content-type");
    } catch (e) { console.error("[tg] nakladnoy photo fetch failed", e); }
  }

  const company = (await bzGetSetting("company_name")) ?? 'FORTIGEN MCHJ';
  const pdfBytes = await nkBuildPdf({
    photoBytes,
    photoMime,
    date: st.date ?? new Date().toISOString().slice(0, 10),
    project: st.project_name ?? "",
    supplier: st.supplier ?? "",
    nakladnoy_no: st.nakladnoy_no ?? "",
    items: st.items as any[],
    company,
  });

  const stamp = Date.now();
  const safeNo = (st.nakladnoy_no ?? "nk").replace(/[^a-zA-Z0-9_-]/g, "_");
  const pdfKey = `pdf/${stamp}-${safeNo}.pdf`;
  let pdfUrl: string | null = null;
  try {
    await sb.storage.from("nakladnoy").upload(pdfKey, pdfBytes, { contentType: "application/pdf" });
    pdfUrl = sb.storage.from("nakladnoy").getPublicUrl(pdfKey).data.publicUrl;
  } catch (e) { console.error("[tg] nakladnoy pdf upload failed", e); }

  const groupId = crypto.randomUUID();
  const rows = (st.items as any[]).map((it) => ({
    project_id: st.project_id,
    material_name: it.name,
    qty: Number(it.qty) || 0,
    unit: it.unit ?? null,
    unit_price: Number(it.unit_price) || 0,
    supplier_name: st.supplier ?? null,
    received_at: st.date,
    photo_url: st.photo_url,
    pdf_url: pdfUrl,
    nakladnoy_no: st.nakladnoy_no,
    receipt_group_id: groupId,
    telegram_user_id: session.telegram_user_id,
    source: "telegram_nakladnoy",
    source_note: `Nakladnoy №${st.nakladnoy_no} — ${st.supplier}`,
  }));
  const { error: insErr } = await sb.from("material_receipts").insert(rows as any);
  if (insErr) {
    await send(session.chat_id, `❌ Saqlash xatosi: ${insErr.message}`, mainMenu(0, session.chat_id));
    return;
  }

  const total = (st.items as any[]).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  const filename = `nakladnoy-${safeNo}-${stamp}.pdf`;
  const caption = `🚚 <b>Nakladnoy №${st.nakladnoy_no}</b>\n📅 ${st.date}\n🏗 ${st.project_name}\n🏭 ${st.supplier}\n📦 ${st.items.length} qator · 💰 ${fmtMoney(total)} so'm`;
  await nkSendPdf(session.chat_id, pdfBytes, filename, caption);

  const accId = await bzGetSetting("accounting_chat_id");
  if (accId) {
    const aid = Number(accId);
    if (Number.isFinite(aid)) {
      await nkSendPdf(aid, pdfBytes, filename, caption + `\n\n👤 @${session.username ?? session.telegram_user_id}`);
    }
  }

  session.flow = null;
  session.data = { ...(session.data ?? {}), nk: null };
  await saveSession(session);
  await send(session.chat_id, `✅ Nakladnoy saqlandi va yuborildi.`, mainMenu(getDraft(session).length, session.chat_id));
}

// ---------- Davomat helper ----------
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=uz`,
      { headers: { "User-Agent": "QurilishNazorat/1.0" } }
    );
    if (!r.ok) return null;
    const j: any = await r.json();
    return j?.display_name ?? null;
  } catch {
    return null;
  }
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function handleAttendanceLocation(
  session: Session,
  loc: { latitude: number; longitude: number },
  kind: "check_in" | "check_out",
  note: string | null,
) {
  const sb = admin();
  const uid = session.telegram_user_id;
  const { data: prof } = await sb
    .from("profiles")
    .select("id, full_name, phone")
    .eq("telegram_user_id", uid)
    .maybeSingle();
  let employee_id: string | null = null;
  let employee_name: string | null = prof?.full_name ?? null;
  if (prof?.phone) {
    const digits = String(prof.phone).replace(/\D/g, "");
    const tail = digits.slice(-9);
    const { data: emps } = await sb.from("employees").select("id, full_name, phone");
    const found = (emps ?? []).find((e: any) => {
      const d = String(e.phone ?? "").replace(/\D/g, "");
      return d && (d === digits || d.endsWith(tail) || tail.endsWith(d.slice(-9)));
    });
    if (found) { employee_id = found.id; employee_name = found.full_name; }
  }

  // Kunlik limit: bir kunda faqat 1 ta Keldim va 1 ta Ketdim
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
  const { data: existing } = await sb
    .from("employee_attendance")
    .select("id, kind")
    .eq("telegram_user_id", uid)
    .eq("attendance_date", todayStr);
  const alreadyHas = (existing ?? []).some((r: any) => r.kind === kind);
  if (alreadyHas) {
    session.flow = null;
    session.data = { ...session.data, pending_loc: null, pending_note: null };
    await saveSession(session);
    const label = kind === "check_in" ? "🟢 Keldim" : "🔴 Ketdim";
    await send(
      session.chat_id,
      `⚠️ Bugun siz allaqachon <b>${label}</b> qayd etgansiz. Kuniga faqat 1 marta Keldim va 1 marta Ketdim qabul qilinadi.`,
      mainMenu(getDraft(session).length, session.chat_id),
    );
    return;
  }

  const address = await reverseGeocode(loc.latitude, loc.longitude);

  const project_id = session.data?.project_id ?? null;
  let is_within: boolean | null = null;
  let distance_m: number | null = null;
  let projectName: string | null = null;
  if (project_id) {
    const { data: prj } = await sb
      .from("projects")
      .select("name, geo_lat, geo_lng, geo_radius_m")
      .eq("id", project_id)
      .maybeSingle();
    projectName = (prj as any)?.name ?? null;
    if (prj && (prj as any).geo_lat != null && (prj as any).geo_lng != null) {
      distance_m = Math.round(
        haversineMeters(loc.latitude, loc.longitude, (prj as any).geo_lat, (prj as any).geo_lng)
      );
      is_within = distance_m <= ((prj as any).geo_radius_m ?? 200);
    }
  }

  const { error } = await sb.from("employee_attendance").insert({
    employee_id,
    employee_name,
    project_id,
    telegram_user_id: uid,
    kind,
    lat: loc.latitude,
    lng: loc.longitude,
    address,
    is_within_geofence: is_within,
    distance_m,
    note,
  });

  session.flow = null;
  session.data = { ...session.data, pending_loc: null, pending_note: null, last_att_id: null };
  await saveSession(session);

  if (error) {
    await send(session.chat_id, `❌ Saqlash xatosi: ${error.message}`, mainMenu(getDraft(session).length, session.chat_id));
    return;
  }

  const time = new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" });
  const label = kind === "check_in" ? "🟢 Ishga kelish" : "🔴 Ishdan chiqish";
  let geoLine = "";
  if (is_within === true) geoLine = `\n✅ Obyekt chegarasida (${distance_m} m)`;
  else if (is_within === false) geoLine = `\n⚠️ Obyekt chegarasidan tashqarida (${distance_m} m)`;
  else if (project_id && projectName) geoLine = `\nℹ️ Loyiha (${projectName}) uchun chegara sozlanmagan.`;
  const noteLine = note ? `\n📝 ${note}` : "";

  await send(
    session.chat_id,
    `✅ ${label} qayd etildi.\n👤 ${employee_name ?? "—"}\n🕒 ${time}\n📍 ${address ?? `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`}${geoLine}${noteLine}`,
    mainMenu(getDraft(session).length, session.chat_id),
  );
}

// ---------- Handler ----------
async function isAllowedTgUser(uid: number): Promise<boolean> {
  const { data } = await admin()
    .from("profiles")
    .select("id,is_active")
    .eq("telegram_user_id", uid)
    .maybeSingle();
  return !!(data && (data.is_active ?? true));
}

export function phoneDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function phoneMatches(savedPhone: unknown, rawPhone: string) {
  const saved = phoneDigits(savedPhone);
  const raw = phoneDigits(rawPhone);
  const savedTail = saved.slice(-9);
  const rawTail = raw.slice(-9);
  return !!saved && !!raw && (saved === raw || savedTail === rawTail);
}

async function linkProfileByContact(chat_id: number, uid: number, username: string | null, contact: any) {
  if (contact.user_id && contact.user_id !== uid) {
    await send(chat_id, "❌ Faqat o'zingizning telefon raqamingizni ulashing.");
    return true;
  }
  const raw = phoneDigits(contact.phone_number);
  const { data: profiles } = await admin()
    .from("profiles")
    .select("id,full_name,telegram_user_id,phone,is_active")
    .limit(2000);
  const prof = (profiles ?? []).find((p: any) => (p.is_active ?? true) && phoneMatches(p.phone, raw));
  if (!prof) {
    await send(chat_id, `❌ Bu telefon raqami (${raw}) tizimda topilmadi.\nAdministratordan profil yaratishini so'rang.`);
    return true;
  }
  await admin()
    .from("profiles")
    .update({ telegram_user_id: uid, telegram_username: username })
    .eq("id", prof.id);
  buttonAccessByChat.set(chat_id, await loadButtonAccess(chat_id, uid));
  await getSession(chat_id, uid, username);
  await send(chat_id, `✅ <b>Profil ulandi</b>\n👤 ${prof.full_name ?? "—"}`, mainMenu(0, chat_id));
  await showFirmPicker(chat_id);
  return true;
}

// ---------- AI chat oqimi (CEO va boshqa ruxsatli rollar uchun) ----------
async function runAiChat(session: any, msg: any, text: string, ceoOnly: boolean) {
  const chat_id: number = session.chat_id;
  if (aiAllowedByChat.get(chat_id) !== true) {
    session.flow = null;
    await saveSession(session);
    await send(chat_id, "⛔ AI yordamchiga ruxsat yo'q.", mainMenu(getDraft(session).length, chat_id));
    return;
  }
  const menu = () => (ceoOnly ? { remove_keyboard: true } : chatMenu());

  if (!ceoOnly && (text === "⬅️ Orqaga" || text === "🚪 Chatdan chiqish" || text === "/chiqish" || text === "🧹 Suhbatni tozalash")) {
    session.flow = null;
    session.data = { ...session.data, chat_history: [] };
    await saveSession(session);
    await send(chat_id, "⬅️ Asosiy menyuga qaytdingiz.", mainMenu(getDraft(session).length, chat_id));
    return;
  }

  // Ovoz → transkripsiya → savol
  let question = text;
  const isVoiceInput = !text && !!(msg.voice || msg.audio);
  if (!question && (msg.voice || msg.audio)) {
    const fileId = msg.voice?.file_id ?? msg.audio?.file_id;
    const f = await uploadFile(fileId, `voice/chat`);
    if (f) {
      await send(chat_id, "🎧 Ovoz tinglanmoqda...");
      question = (await transcribeAudio(f.bytes, f.mime)) ?? "";
    }
  }
  if (!question) {
    await send(chat_id, "📝 Savolni matn yoki ovoz orqali yuboring.", menu());
    return;
  }

  // «excel qilib ber» → Sheet'ning oxirgi holati .xlsx
  const excelKind = detectExcelRequest(question);
  if (excelKind) {
    await tg("sendChatAction", { chat_id, action: "upload_document" });
    const x = await buildSheetExcel(excelKind).catch((e) => { console.error("excel", e); return null; });
    if (!x) { await send(chat_id, "⚠️ Jadvalni o'qib bo'lmadi, Excel tayyorlanmadi. Birozdan keyin qayta so'rang.", menu()); return; }
    const fd = new FormData();
    fd.append("chat_id", String(chat_id));
    fd.append("caption", `📊 <b>${excelKind === "fuel" ? "Salyarka" : excelKind === "hr" ? "HR" : excelKind === "dpr" ? "DPR" : "Kassa"} jadvali</b> — oxirgi holat (${x.rows} qator)`);
    fd.append("parse_mode", "HTML");
    const ab = x.bytes.buffer.slice(x.bytes.byteOffset, x.bytes.byteOffset + x.bytes.byteLength) as ArrayBuffer;
    fd.append("document", new Blob([ab], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), x.filename);
    await fetch(`${TG_API}/sendDocument`, { method: "POST", body: fd });
    return;
  }

  // «kechagi kun hisoboti» → Sheet asosida PDF
  const reportDate = detectDayReportRequest(question);
  if (reportDate) {
    await tg("sendChatAction", { chat_id, action: "upload_document" });
    if (await sendSpecialReport(chat_id, question, reportDate)) return;
    const rep = await buildSheetDayPdf(reportDate).catch((e) => { console.error("day pdf", e); return null; });
    if (!rep) {
      await send(chat_id, "⚠️ Jadvalni o'qib bo'lmadi, PDF tayyorlanmadi. Birozdan keyin qayta so'rang.", menu());
      return;
    }
    const f = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/[\s,\u00a0\u202f]/g, " ");
    await nkSendPdf(
      chat_id,
      rep.bytes,
      `PV_Olga_hisobot_${reportDate}.pdf`,
      `📄 <b>${reportDate} hisoboti</b>\n🟢 Kirim: <b>${f(rep.inc)}</b>\n🔴 Chiqim: <b>${f(rep.exp)}</b>\n💰 Kun oxiri qoldiq: <b>${f(rep.balance)}</b> so'm`,
    );
    return;
  }

  const history: { role: "user" | "assistant"; content: string }[] = Array.isArray(session.data?.chat_history) ? session.data.chat_history : [];
  history.push({ role: "user", content: question });
  await tg("sendChatAction", { chat_id, action: isVoiceInput ? "record_voice" : "typing" });
  // Ma'lumot manbai — Google Sheet (Master_Data), savol bo'yicha butun jadvaldan qidiradi
  const [cashCtx, fuelCtx, hrCtx, dprCtx] = await Promise.all([
    getSheetContext(question).catch(() => null),
    getFuelContext(question).catch(() => null),
    getHrContext(question).catch(() => null),
    getDprContext(question).catch(() => null),
  ]);
  const sheetCtx = [cashCtx ? `MANBA 1 — NAQD KASSA (so'm):\n${cashCtx}` : "", fuelCtx ?? "", hrCtx ?? "", dprCtx ?? ""].filter(Boolean).join("\n\n") || null;
  const agentHistory = sheetCtx
    ? [
        ...history.slice(0, -1),
        {
          role: "user" as const,
          content: `Quyidagi Google Sheet ma'lumotlariga tayanib javob ber (moliya, kassa, xarajat, kirim savollari uchun asosiy manba shu):\n${sheetCtx}\n\nSAVOL: ${question}`,
        },
      ]
    : history;
  const reply = sheetCtx
    ? await askSheetAi(history.slice(0, -1), sheetCtx, question, isVoiceInput)
    : await askAgent(agentHistory, session.data?.project_id ?? null, isVoiceInput ? "voice" : "mobile", Number(msg?.from?.id ?? session.telegram_user_id));
  history.push({ role: "assistant", content: reply });
  session.data = { ...session.data, chat_history: history.slice(-12) };
  await saveSession(session);
  if (isVoiceInput) {
    if (reply.startsWith("⚠️")) {
      await send(chat_id, mdToHtml(reply).slice(0, 3800), menu());
    } else {
      const audio = await aishaTts(reply);
      const ok = audio ? await sendVoice(chat_id, audio) : false;
      if (!ok) {
        await send(chat_id, "🔇 Ovozli javob yuborib bo'lmadi (TTS xatosi). Matn bilan beraman:", menu());
        await send(chat_id, mdToHtml(reply).slice(0, 3800), menu());
      }
    }
  } else {
    await send(chat_id, mdToHtml(reply).slice(0, 3800), menu());
  }
}

// ================= GURUH REJIMI =================
// Guruhda bot jim turadi: faqat xarajat/kirimga o'xshash matn, ovoz yoki
// izohli rasm kelganda ishga tushadi va yozuvni shu guruh daftariga qo'shadi.

/** Matn xarajat/kirim yozuviga o'xshaydimi? */
function looksLikeGroupEntry(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 3) return false;
  if (t.startsWith("/")) return false;
  if (isIncomeText(t)) return true;
  // Suhbatga aralashmaslik: savol, salomlashish, vaqt/manzil gaplari — xarajat emas.
  if (/\?\s*$/.test(t)) return false;
  const low = t.toLocaleLowerCase("uz");
  if (/^(salom|assalom|rahmat|ok|xo['‘’`]?p|ha\b|yo['‘’`]?q\b)/.test(low)) return false;
  if (!/[a-zA-Zа-яёА-ЯЁ']{3,}/.test(t)) return false;
  // Summa bo'lishi shart: 4+ xonali son yoki «ming/mln/k/so'm» bilan yozilgan son.
  const money = /\d[\d\s.,]{3,}\d|\d+(?:[.,]\d+)?\s*(ming|минг|тыс|mln|млн|million|k\b|so['‘’`]?m|сум|сўм)/i;
  const fuel = /\d+\s*(l|litr|литр)\b/i.test(low) && /salyarka|solyarka|dizel|benzin|metan|propan/.test(low);
  return money.test(low) || fuel;
}

/** Guruhga loyihani biriktiradi (bir marta), keyin eslab qoladi. */
async function ensureGroupProject(session: Session): Promise<boolean> {
  if (session.data?.project_id) return true;
  const { data } = await admin()
    .from("projects").select("id,name").eq("status", "active").order("created_at").limit(1);
  const p = (data ?? [])[0] as { id: string; name: string } | undefined;
  if (!p) {
    await send(session.chat_id, "❌ Faol loyiha topilmadi. Avval tizimda loyiha yarating.");
    return false;
  }
  session.data = { ...(session.data ?? {}), project_id: p.id, project_name: p.name };
  await saveSession(session);
  projectNameByChat.set(session.chat_id, p.name);
  return true;
}

/**
 * Guruhdagi yozuvni navbatga qo'yadi va qisqa «Qabul qilindi» javobini beradi.
 * Tugmalar chiqmaydi — tasdiqlash botning shaxsiy chatidagi Daftarda bo'ladi.
 */
/** Telegram username → "@username" (ism bo'lsa o'zi). */
function tgAuthorTag(u: string | null | undefined): string | null {
  const v = String(u ?? "").trim();
  if (!v) return null;
  return /^[A-Za-z0-9_]{4,}$/.test(v) ? `@${v}` : v;
}

async function addToGroupDaftar(session: Session, items: any[], meta: { source: string; note: string }) {
  if (!items.length) return;
  const author = tgAuthorTag(session.username);
  const tagged = items.map((it) => ({ ...it, _source: meta.source, _source_note: meta.note, _author: it._author ?? author }));
  session.data = { ...(session.data ?? {}), draft: [...getDraft(session), ...tagged] };
  await saveSession(session);
  const lines = tagged.map((it) => {
    const amount = Number(it.amount) || (Number(it.qty) || 1) * (Number(it.unit_price) || 0);
    const name = it.kind === "income" ? (it.description ?? "Kirim") : (it.name ?? it.description ?? "Xarajat");
    return `• ${name} — ${fmtMoney(amount)} so'm`;
  });
  await send(session.chat_id, `✅ <b>Qabul qilindi</b>\n${lines.join("\n")}`);
}



async function handleGroupMessage(msg: any) {
  const chat_id = msg.chat.id;
  const uid = msg.from?.id ?? chat_id;
  const username = msg.from?.username ?? msg.from?.first_name ?? null;
  const who = msg.from?.first_name ?? msg.from?.username ?? "";
  let text: string = (msg.text ?? "").toString().trim();
  // @bot_nomi mentionini olib tashlaymiz
  text = text.replace(/@[A-Za-z0-9_]+bot\b/gi, "").trim();

  // Guruhda istalgan a'zo xarajat yoza oladi — hammasi baribir Daftarga tushadi
  // va admin tasdiqlaydi. Buyruqlar (/loyiha) faqat ro'yxatdagi foydalanuvchilarga.
  const isRegistered = await isAllowedTgUser(uid);

  const session = await getSession(chat_id, uid, username);
  session.telegram_user_id = uid;
  session.username = username;

  const lower = text.toLocaleLowerCase("uz");
  const cmd = lower.replace(/@[a-z0-9_]+$/i, "");

  // ----- Fina (AI) tahlil guruhi rejimi -----
  const aiGroups = String((await bzGetSetting("ai_group_chats")) ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const isAiGroup = aiGroups.includes(String(chat_id));
  if (cmd.startsWith("/rejim")) {
    if (!isRegistered) return;
    const arg = cmd.replace(/^\/rejim/, "").trim();
    const next = arg.startsWith("ai")
      ? Array.from(new Set([...aiGroups, String(chat_id)]))
      : aiGroups.filter((x) => x !== String(chat_id));
    await admin().from("app_settings").upsert({ key: "ai_group_chats", value: next.join(",") } as any, { onConflict: "key" });
    await send(chat_id, arg.startsWith("ai")
      ? "🧠 Bu guruh endi <b>Fina tahlil guruhi</b>. Savol, ovoz yoki hisobot so'rang — xarajat yozilmaydi."
      : "📝 Bu guruh endi <b>xarajat yozish</b> guruhi.");
    return;
  }
  if (isAiGroup) {
    if (!isRegistered) return; // begonalarga jim
    if (cmd === "/start") {
      await send(chat_id, "🧠 <b>Boshqaruv va Fina tahlil guruhi</b>\nSavol yozing yoki ovoz yuboring, «kechagi hisobot» / «salyarka hisoboti» deb PDF so'rang.");
      return;
    }
    const hasVoice = !!(msg.voice || msg.audio);
    if (!hasVoice) {
      if (!text || text.startsWith("/")) return;
      // oddiy suhbatga aralashmaslik: faqat savol yoki hisobot so'rovi
      const replyToBot = msg.reply_to_message?.from?.is_bot === true;
      const isQuestion =
        replyToBot ||
        /@\w*bot|\bfina\b/i.test(String(msg.text ?? msg.caption ?? "")) ||
        !!detectExcelRequest(text) ||
        /(salyarka|sarf|farq|narx|shubha|bugun|kecha|oylik|kategoriya|chiqar|ayt|excel|exel|tahlil|maslahat|xarajat|kirim|chiqim)/i.test(lower) ||
        /\?/.test(text) ||
        !!detectDayReportRequest(text) ||
        /\b(innoai|bot|qancha|nechta|necha|qancha|kim|qayer|qachon|nima|hisobot|pdf|qoldiq|jami|ber|ko'rsat|aytib)\b/i.test(lower);
      if (!isQuestion) return;
    }
    aiAllowedByChat.set(chat_id, true);
    await runAiChat(session, msg, text, true);
    return;
  }

  // ----- Buyruqlar -----
  if (cmd === "/start" || cmd === "/daftar" || /^(📒\s*)?daftar$/.test(cmd)) {
    if (!(await ensureGroupProject(session))) return;
    const n = getDraft(session).length;
    await send(
      chat_id,
      `📝 Bu guruh faqat <b>xarajat yozish</b> uchun. Loyiha: <b>${session.data?.project_name ?? "—"}</b>\n` +
        `Kutilayotgan yozuvlar: <b>${n} ta</b>\n\n` +
        `Tasdiqlash botning shaxsiy chatidagi <b>Daftar</b> bo'limida.`,
    );
    return;
  }
  if (cmd.startsWith("/loyiha")) {
    if (!isRegistered) return;
    const q = text.slice(cmd.length).trim() || text.replace(/^\/loyiha(@\S+)?/i, "").trim();
    const { data } = await admin().from("projects").select("id,name").eq("status", "active").order("name");
    const list = (data ?? []) as Array<{ id: string; name: string }>;
    const found = q ? list.find((p) => p.name.toLocaleLowerCase("uz").includes(q.toLocaleLowerCase("uz"))) : null;
    if (!found) {
      await send(chat_id, `📍 Loyihalar:\n${list.map((p) => `• ${p.name}`).join("\n")}\n\nTanlash: <code>/loyiha Nomi</code>`);
      return;
    }
    session.data = { ...(session.data ?? {}), project_id: found.id, project_name: found.name };
    await saveSession(session);
    projectNameByChat.set(chat_id, found.name);
    await send(chat_id, `✅ Guruh loyihasi: <b>${found.name}</b>`);
    return;
  }

  // AI suhbat/hisobot guruhda ishlamaydi — faqat CEO uchun ochiq.
  const isCeo = await checkCeoOnly(uid);
  if (!isCeo && (cmd.startsWith("/ai") || detectDayReportRequest(text))) {
    await send(chat_id, "ℹ️ Bu guruh faqat xarajat yozish uchun. Hisobot va AI botning shaxsiy chatida.");
    return;
  }

  // ----- Ovozli xabar -----
  const voiceId = msg.voice?.file_id ?? msg.audio?.file_id ?? null;
  if (voiceId) {
    if (!(await ensureGroupProject(session))) return;
    const f = await uploadFile(voiceId, "audio/auto");
    if (!f) return;
    const transcript = await transcribeAudio(f.bytes, f.mime);
    if (!transcript) return;
    if (!looksLikeGroupEntry(transcript)) return;
    const items = await aiParse(transcript, null);
    if (!items.length) return;
    await addToGroupDaftar(session, items, { source: "telegram_group_voice", note: `🎤 ${who}: "${transcript.slice(0, 200)}"` });
    return;
  }

  // ----- Rasm (faqat izohi bo'lsa) -----
  const photoFileId = msg.photo?.length ? msg.photo[msg.photo.length - 1].file_id : null;
  const cap = (msg.caption ?? "").toString().trim();
  if (photoFileId) {
    if (!cap) return; // izohsiz rasm — oddiy suhbat rasmi, tegmaymiz
    if (!(await ensureGroupProject(session))) return;
    const f = await uploadFile(photoFileId, "image/auto");
    if (!f) return;
    const items = await aiParse(cap, f.dataUrl);
    if (!items.length) return;
    await addToGroupDaftar(session, items, { source: "telegram_group_photo", note: `🖼 ${who}: "${cap.slice(0, 200)}"` });
    return;
  }

  // ----- Matn -----
  if (!text) return;
  if (!(await ensureGroupProject(session))) return;
  if (!looksLikeGroupEntry(text)) return;
  const items = await aiParse(text, null);
  if (!items.length) return; // tushunmasa — guruhda jim
  await addToGroupDaftar(session, items, { source: "telegram_group_text", note: `💬 ${who}: "${text.slice(0, 200)}"` });
}

export async function handleUpdate(update: any) {
  void removeAiFromCommandMenu();
  if (update.callback_query) return handleCallback(update.callback_query);

  const msg = update.message;
  if (!msg) return;
  const chat_id = msg.chat.id;
  const uid = msg.from?.id ?? chat_id;
  const username = msg.from?.username ?? msg.from?.first_name ?? null;
  const text: string = (msg.text ?? "").trim();

  // ===== Guruh / superguruh =====
  if (msg.chat?.type === "group" || msg.chat?.type === "supergroup") {
    await handleGroupMessage(msg);
    return;
  }


  // ===== Tizimga kirish so'rovi (har kim uchun) — contactdan oldin =====
  if (await tryStartJoinRequest(chat_id, uid, username, text)) return;
  if (await tryHandleJoinFlow(chat_id, uid, username, msg)) return;

  if (msg.contact?.phone_number) {
    if (await linkProfileByContact(chat_id, uid, username, msg.contact)) return;
  }

  // 🔒 Begonalarga yopiq — kirish faqat taklif havolasi orqali
  if (!(await isAllowedTgUser(uid))) {
    await send(chat_id, "🔒 Bu bot yopiq. Kirish faqat administrator yuborgan havola orqali.");
    return;
  }


  // ===== Admin buyruqlari =====
  if (await tryHandleAdminFlow(chat_id, uid, msg)) return;
  if (await tryHandleAdminCommand(chat_id, uid, text)) return;

  const session = await getSession(chat_id, uid, username);
  // AI ruxsatini cache'ga olamiz (admin/PM/CEO uchun)
  aiAllowedByChat.set(chat_id, await checkAiAccess(uid));
  const ceoOnly = await checkCeoOnly(uid);
  ceoOnlyByChat.set(chat_id, ceoOnly);
  buttonAccessByChat.set(chat_id, await loadButtonAccess(chat_id, uid));

  // ===== CEO: botda faqat /start va AI savol-javob =====
  if (ceoOnly) {
    if (text === "/start" || text === "/menu") {
      void tg("setChatMenuButton", { chat_id, menu_button: { type: "default" } });
      session.flow = "ai_chat";
      session.data = { ...session.data, chat_history: [] };
      await saveSession(session);
      await send(
        chat_id,
        `Salom, men <b>Fina</b>man — sizning sevimli yordamchingizman.\n\nLoyihalar bo'yicha ma'lumotlar va hisobot beraman.`,
        mainMenu(getDraft(session).length, chat_id),
      );
      return;
    }
    if (session.flow !== "ai_chat") {
      session.flow = "ai_chat";
      await saveSession(session);
    }
    await runAiChat(session, msg, text, true);
    return;
  }

  // ===== ⛽ Salyarka / 📋 DPR / 👥 HR tugmalari =====
  if (!isGroupChat(chat_id)) {
    const requestedButton: BotButtonKey | null = text === "📊 Loyiha" ? "project"
      : text === "⛽ Salyarka" ? "fuel"
        : /^(?:📒\s*)?Daftar \(/.test(text ?? "") ? "ledger"
          : (text === "📄 DPR" || text === "📋 DPR") ? "dpr"
            : text === "👥 HR" ? "hr"
              : text === "✨ Fina" ? "innoai"
                : null;
    if (requestedButton && !canUseButton(chat_id, requestedButton)) {
      await send(chat_id, "⛔ Bu bo'lim sizga biriktirilmagan.", mainMenu(getDraft(session).length, chat_id));
      return;
    }
    const fuelKb = { keyboard: [[{ text: "↩️ Orqaga" }]], resize_keyboard: true };
    if (text === "⛽ Salyarka") {
      session.flow = "fuel";
      await saveSession(session);
      await send(chat_id, "⛽ <b>Salyarka</b>\n\nLitrni yozing yoki 🎤 ovoz yuboring (summa kerak emas).\nMasalan:\n• «Ekskavator 871 ga 100 litr — Javohir»\n• «Greyder 231 60 litr, Pogruzchik 060 40 litr»\n• «Bazaga 2000 litr keldi»\n\nYozuvlar faqat «PV olga Salyarka» jadvaliga tushadi.", fuelKb);
      return;
    }
    if (text === "👥 HR") {
      session.flow = "hr";
      await saveSession(session);
      await send(chat_id, "👥 <b>HR</b>\n\nXodim yozuvini yozing yoki 🎤 ovoz yuboring.\nMasalan:\n• «Javohir bugun ishda — prorab, Olg'a»\n• «Azamat kelmadi, kasal»\n• «Sardor ishga qabul qilindi, usta»\n• «Bekzod ishdan ketdi»\n\nYozuvlar faqat «PV Olg'a HR» jadvaliga tushadi.", fuelKb);
      return;
    }
    if (text === "📄 DPR" || text === "📋 DPR") {
      session.flow = "dpr";
      await saveSession(session);
      await send(chat_id, "📄 <b>DPR — kunlik ish hajmi</b>\n\nBajarilgan ishni yozing yoki 🎤 ovoz yuboring (summa kerak emas).\nMasalan:\n• «Tracker, 1-blok — saddle bracket 215 dona»\n• «3-blokda kabel 450 metr tortildi»\n• «Inshoot: beton 12 kub»\n\nYozuvlar faqat «PV DPR» jadvalining Daily_Log varag'iga tushadi.", fuelKb);
      return;
    }
    if (session.flow === "fuel" || session.flow === "hr" || session.flow === "dpr") {
      const menuBtn = text === "📊 Loyiha" || text === "📄 DPR" || text === "👥 HR" || text === "✨ Fina";
      const isDaftar = /^(?:📒\s*)?Daftar \(/.test(text ?? "");
      if (text === "↩️ Orqaga" || text === "/start" || text === "/menu" || isDaftar || menuBtn) {
        session.flow = null;
        await saveSession(session);
        if (!isDaftar && !menuBtn) {
          await send(chat_id, "↩️ Bosh menyu.", mainMenu(getDraft(session).length, chat_id));
          return;
        }
        // Boshqa menyu tugmalari — pastdagi o'z handlerlariga o'tadi
      } else if (session.flow === "hr") {
        let raw = text ?? "";
        if (!raw && (msg.voice || msg.audio)) {
          const fid = msg.voice?.file_id ?? msg.audio?.file_id;
          const f = await uploadFile(fid, `voice/hr`);
          if (f) raw = (await transcribeAudio(f.bytes, f.mime)) ?? "";
        }
        if (!raw) { await send(chat_id, "📝 Matn yoki 🎤 ovoz yuboring.", fuelKb); return; }
        const hrRepDate = detectDayReportRequest(raw);
        if (hrRepDate) {
          await tg("sendChatAction", { chat_id, action: "upload_document" });
          await sendSpecialReport(chat_id, `hr ${raw}`, hrRepDate);
          return;
        }
        await tg("sendChatAction", { chat_id, action: "typing" });
        const entries = await aiParseHr(raw);
        if (!entries.length) { await send(chat_id, "⚠️ Xodim yozuvini tushuna olmadim. Masalan: «Javohir bugun ishda — prorab».", fuelKb); return; }
        const r = await appendHrEntries(entries, `${chat_id}:${msg.message_id}`);
        if (r.error) { await send(chat_id, `⚠️ Jadvalga yozilmadi: ${r.error.slice(0, 150)}`, fuelKb); return; }
        const lines = entries.map((e) => `• ${e.name}${e.role ? ` (${e.role})` : ""} — <b>${e.type}</b>`);
        await send(chat_id, `✅ HR jadvaliga ${r.appended} ta yozuv qo'shildi:\n${lines.join("\n")}`, fuelKb);
        return;
      } else if (session.flow === "dpr") {
        let raw = text ?? "";
        if (!raw && (msg.voice || msg.audio)) {
          const fid = msg.voice?.file_id ?? msg.audio?.file_id;
          const f = await uploadFile(fid, `voice/dpr`);
          if (f) raw = (await transcribeAudio(f.bytes, f.mime)) ?? "";
        }
        if (!raw) { await send(chat_id, "📝 Matn yoki 🎤 ovoz yuboring.", fuelKb); return; }
        const dprRepDate = detectDayReportRequest(raw);
        if (dprRepDate) {
          await tg("sendChatAction", { chat_id, action: "upload_document" });
          await sendSpecialReport(chat_id, `dpr ${raw}`, dprRepDate);
          return;
        }
        await tg("sendChatAction", { chat_id, action: "typing" });
        const entries = await aiParseDpr(raw);
        if (!entries.length) { await send(chat_id, "⚠️ Ish hajmini tushuna olmadim. Masalan: «Tracker, 1-blok — saddle bracket 215 dona».", fuelKb); return; }
        const r = await appendDprEntries(entries, `${chat_id}:${msg.message_id}`);
        if (r.error) { await send(chat_id, `⚠️ Jadvalga yozilmadi: ${r.error.slice(0, 150)}`, fuelKb); return; }
        const lines = entries.map((e) => `• ${e.direction || "—"}${e.block ? `, ${e.block}-blok` : ""} — ${e.work}: <b>${e.qty} ${e.unit}</b>`);
        await send(chat_id, `✅ DPR jadvaliga ${r.appended} ta yozuv qo'shildi:\n${lines.join("\n")}`, fuelKb);
        return;
      } else {
        let raw = text ?? "";
        if (!raw && (msg.voice || msg.audio)) {
          const fid = msg.voice?.file_id ?? msg.audio?.file_id;
          const f = await uploadFile(fid, `voice/fuel`);
          if (f) raw = (await transcribeAudio(f.bytes, f.mime)) ?? "";
        }
        if (!raw) { await send(chat_id, "📝 Matn yoki 🎤 ovoz yuboring.", fuelKb); return; }
        const fuelRepDate = detectDayReportRequest(raw);
        if (fuelRepDate) {
          await tg("sendChatAction", { chat_id, action: "upload_document" });
          await sendSpecialReport(chat_id, `salyarka ${raw}`, fuelRepDate);
          return;
        }
        await tg("sendChatAction", { chat_id, action: "typing" });
        const entries = await aiParseFuel(raw);
        if (!entries.length) { await send(chat_id, "⚠️ Litrni tushuna olmadim. Masalan: «Ekskavator 871 ga 100 litr — Javohir».", fuelKb); return; }
        const r = await appendFuelEntries(entries, `${chat_id}:${msg.message_id}`);
        if (r.error) { await send(chat_id, `⚠️ Jadvalga yozilmadi: ${r.error.slice(0, 150)}`, fuelKb); return; }
        const lines = entries.map((e) => `• ${e.type === "KIRIM" ? "📥 KIRIM" : "📤"} ${e.tech || "—"}${e.driver ? ` (${e.driver})` : ""} — <b>${e.liters} l</b>`);
        await send(chat_id, `✅ Salyarka jadvaliga ${r.appended} ta yozuv qo'shildi:\n${lines.join("\n")}`, fuelKb);
        return;
      }
    }
  }

  // ===== Kunlik hisobot — davom etayotgan oqim =====
  if (session.flow === "dr" && (session.data?.dr?._pending && session.data?.dr?._pending !== "none")) {
    // Rasm qabul qilish
    const pending = session.data?.dr?._pending;
    const photoFid = msg.photo?.length ? msg.photo[msg.photo.length - 1].file_id : null;
    const docImg = msg.document && (msg.document.mime_type ?? "").startsWith("image/");
    if (pending === "photo" && (photoFid || docImg)) {
      const fid = photoFid ?? msg.document.file_id;
      const f = await uploadFile(fid, "daily-report");
      const d = session.data?.dr ?? {};
      if (f) d.photo_url = f.url;
      else d.photo_url = `tg:${fid}`;
      d._pending = "none";
      session.flow = "dr";
      session.step = "summary";
      session.data = { ...(session.data ?? {}), dr: d };
      await saveSession(session);
      await send(chat_id, f ? "🖼 Rasm qabul qilindi." : "🖼 Rasm yuklab olinmadi, lekin davom etamiz.");
      await drShowSummary(session, chat_id);
      return;
    }
    // Matn qabul qilish
    if (await drHandleText(session, chat_id, text)) return;
  }

  // ===== Kunlik hisobot — Excel fayl yoki daftar rasmini o'qish =====
  if (session.flow === "dr" && (session.data?.dr?._pending ?? "none") === "none") {
    const impPhoto = msg.photo?.length ? msg.photo[msg.photo.length - 1].file_id : null;
    const impDoc = msg.document ?? null;
    if (impPhoto || impDoc) {
      const pid = session.data?.dr?.project_id ?? session.data?.project_id;
      if (!pid) {
        await send(chat_id, "❌ Avval loyihani tanlang.");
        await showProjectPicker(chat_id, null);
        return;
      }
      await drImportFile(
        session,
        chat_id,
        pid,
        impPhoto ?? impDoc.file_id,
        impDoc?.file_name ?? "",
        impDoc?.mime_type ?? "",
      );
      return;
    }
  }



  if (text === "/start" || text === "/menu") {
    // Chat menu tugmasini default holatga qaytaramiz (commands ro'yxati)
    void tg("setChatMenuButton", {
      chat_id,
      menu_button: { type: "default" },
    });


    const { data: linked } = await admin()
      .from("profiles").select("id,full_name").eq("telegram_user_id", uid).maybeSingle();

    if (!linked) {
      await send(
        chat_id,
        `<b>👋 Salom!</b>\n\nTizimga ulanish uchun telefon raqamingizni ulashing.`,
        {
          keyboard: [[{ text: "📱 Telefon raqamni ulashish", request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        }
      );
      return;
    }
    await send(
      chat_id,
      `<b>👋 Salom, ${linked.full_name ?? "—"}!</b>`,
    );
    await showProjectPicker(chat_id, null);
    return;
  }



  // Cache project name for header
  if (session.data?.project_name && chat_id) {
    projectNameByChat.set(chat_id, session.data.project_name);
  }

  // ---------- Loyiha tanlash (reply keyboard'dan) ----------
  if (session.flow === "pick_project" && text) {
    if (text === "↩️ Bekor") {
      session.flow = null;
      await saveSession(session);
      projectPickByChat.delete(chat_id);
      await send(chat_id, "↩️ Bekor qilindi.", mainMenu(getDraft(session).length, chat_id));
      return;
    }
    const map = projectPickByChat.get(chat_id);
    const project_id = map?.get(text);
    if (project_id) {
      const { data: p } = await admin().from("projects").select("name").eq("id", project_id).maybeSingle();
      const pname = p?.name ?? "";
      session.data = { ...(session.data ?? {}), project_id, project_name: pname };
      session.flow = null;
      if (pname) projectNameByChat.set(chat_id, pname);
      await saveSession(session);
      projectPickByChat.delete(chat_id);
      await send(chat_id, `✅ Loyiha tanlandi: <b>${pname}</b>`, mainMenu(getDraft(session).length, chat_id));
      return;
    }
    // Boshqa matn — picker ochiq, qaytadan ko'rsatamiz
  }

  // ---------- Smeta picker (item tanlash) ----------
  if (text && session.flow?.startsWith("pick_smeta:")) {
    const scope = session.flow.split(":")[1] as "material" | "work" | "off_plan";
    if (text === "↩️ Orqaga") {
      session.flow = null;
      await saveSession(session);
      smetaPickByChat.delete(chat_id);
      await send(chat_id, "📋 <b>Smeta (B.O.Q):</b>", smetaMenu());
      return;
    }
    const map = smetaPickByChat.get(chat_id);
    const picked = map?.get(text);
    if (picked) {
      session.data = { ...(session.data ?? {}), smeta_pick: picked, smeta_scope: scope };
      session.flow = "smeta_qty";
      await saveSession(session);
      const meta = smetaScopeLabel(scope);
      const left = Math.max(0, picked.qty_plan - picked.used);
      const info = picked.qty_plan > 0
        ? `Reja: <b>${picked.qty_plan} ${picked.unit}</b> · ${fmtMoney(picked.unit_price)}/${picked.unit}\nKiritilgan: ${picked.used} ${picked.unit} · Qoldiq: <b>${left} ${picked.unit}</b>`
        : `Reja yo'q · Smeta narxi: ${fmtMoney(picked.unit_price)}/${picked.unit}`;
      await send(chat_id,
        `${meta.emoji} <b>${picked.name}</b>\n${info}\n\n` +
        `Hajm va fakt birim narxni <b>birga</b> yuboring:\n` +
        `<code>HAJM NARX</code>  (masalan: <code>12 65000</code> yoki <code>3.5x70000</code>)`,
        { keyboard: [[{ text: "↩️ Orqaga" }]], resize_keyboard: true });
      return;
    }
    // Mos kelmasa picker'ni qayta ko'rsatamiz
    if (session.data?.project_id) {
      await showSmetaPicker(chat_id, scope, session.data.project_id);
      return;
    }
  }

  // ---------- Smeta: hajm + fakt narx bir vaqtda ----------
  if (text && session.flow === "smeta_qty") {
    if (text === "↩️ Orqaga") {
      const scope = (session.data?.smeta_scope ?? "material") as "material" | "work" | "off_plan";
      session.flow = null;
      session.data = { ...(session.data ?? {}), smeta_pick: null, smeta_qty: null };
      await saveSession(session);
      if (session.data?.project_id) { await showSmetaPicker(chat_id, scope, session.data.project_id); return; }
    }
    const picked: SmetaPickItem | null = session.data?.smeta_pick ?? null;
    const pid = session.data?.project_id;
    if (!picked || !pid) {
      session.flow = null;
      await saveSession(session);
      await send(chat_id, "❌ Tanlov yo'qoldi. Qaytadan urinib ko'ring.", smetaMenu());
      return;
    }
    // ikkita raqamni ajratib olamiz (probel, x, *, /, vergul-bo'sh joy va h.k.)
    const parts = String(text)
      .replace(/,/g, ".")
      .split(/[^\d.]+/)
      .filter(Boolean);
    const qty = Number(parts[0]);
    const unitPrice = Number(parts[1]);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      await send(chat_id,
        `⚠️ Format: <code>HAJM NARX</code>\nMasalan: <code>12 65000</code> yoki <code>3.5x70000</code>`);
      return;
    }
    session.data = { ...(session.data ?? {}), smeta_qty: qty, smeta_unit_price: unitPrice };
    session.flow = "smeta_confirm";
    await saveSession(session);
    const total = qty * unitPrice;
    const diff = picked.unit_price > 0
      ? `\n📐 Smeta narx: ${fmtMoney(picked.unit_price)}/${picked.unit}`
      : "";
    await send(chat_id,
      `🔎 <b>Tasdiqlang</b>\n\n` +
      `${picked.name}\n` +
      `Hajm: <b>${qty} ${picked.unit}</b>\n` +
      `Fakt narx: <b>${fmtMoney(unitPrice)}</b>/${picked.unit}${diff}\n` +
      `Jami: <b>${fmtMoney(total)}</b>`,
      { keyboard: [[{ text: "✅ Tasdiqlash" }, { text: "✏️ Tahrirlash" }], [{ text: "↩️ Bekor" }]], resize_keyboard: true });
    return;
  }

  // ---------- Smeta: tasdiqlash / tahrirlash ----------
  if (text && session.flow === "smeta_confirm") {
    const picked: SmetaPickItem | null = session.data?.smeta_pick ?? null;
    const qty: number = Number(session.data?.smeta_qty) || 0;
    const unitPrice: number = Number(session.data?.smeta_unit_price) || 0;
    const pid = session.data?.project_id;

    if (text === "✏️ Tahrirlash") {
      session.flow = "smeta_qty";
      await saveSession(session);
      await send(chat_id,
        `Qaytadan yuboring — <code>HAJM NARX</code> (masalan: <code>12 65000</code>):`,
        { keyboard: [[{ text: "↩️ Orqaga" }]], resize_keyboard: true });
      return;
    }
    if (text === "↩️ Bekor") {
      const scope = (session.data?.smeta_scope ?? "material") as "material" | "work" | "off_plan";
      session.flow = null;
      session.data = { ...(session.data ?? {}), smeta_pick: null, smeta_qty: null, smeta_unit_price: null };
      await saveSession(session);
      if (pid) { await showSmetaPicker(chat_id, scope, pid); return; }
      await send(chat_id, "Bekor qilindi.", smetaMenu());
      return;
    }
    if (text !== "✅ Tasdiqlash") {
      await send(chat_id, "Iltimos, tugmalardan birini tanlang: ✅ Tasdiqlash / ✏️ Tahrirlash / ↩️ Bekor");
      return;
    }
    if (!picked || !pid || qty <= 0) {
      session.flow = null;
      await saveSession(session);
      await send(chat_id, "❌ Tanlov yo'qoldi. Qaytadan urinib ko'ring.", smetaMenu());
      return;
    }
    const sb = admin();
    let err: any = null;
    if (picked.kind === "material") {
      ({ error: err } = await sb.from("material_receipts").insert({
        project_id: pid,
        master_material_id: picked.master_material_id ?? undefined,
        material_name: picked.name,
        qty,
        unit: picked.unit,
        unit_price: unitPrice,
        zayavka_id: picked.id,
        telegram_user_id: session.telegram_user_id,
        source: "telegram",
        source_note: `Smeta picker: ${picked.name}`,
      } as any));
    } else {
      ({ error: err } = await sb.from("work_progress").insert({
        project_id: pid,
        master_work_id: picked.master_work_id ?? undefined,
        work_type: picked.name,
        qty_done: qty,
        unit: picked.unit,
        unit_price: unitPrice,
        zayavka_id: picked.id,
        telegram_user_id: session.telegram_user_id,
        source: "telegram",
        source_note: `Smeta picker: ${picked.name}`,
      } as any));
    }
    if (err) {
      await send(chat_id, `⚠️ Saqlashda xatolik: ${err.message}`);
      return;
    }
    const newUsed = picked.used + qty;
    const left = Math.max(0, picked.qty_plan - newUsed);
    const pct = picked.qty_plan > 0 ? Math.min(100, Math.round((newUsed / picked.qty_plan) * 100)) : 0;
    const over = picked.qty_plan > 0 && newUsed > picked.qty_plan;
    const meta = smetaScopeLabel((session.data?.smeta_scope ?? "material") as any);
    const priceDiff = picked.unit_price > 0
      ? `\n💰 Fakt: <b>${fmtMoney(unitPrice)}</b> (reja: ${fmtMoney(picked.unit_price)})`
      : `\n💰 Fakt narx: <b>${fmtMoney(unitPrice)}</b>`;
    const tail = picked.qty_plan > 0
      ? `\n📊 ${newUsed}/${picked.qty_plan} ${picked.unit} · <b>${pct}%</b>${over ? " ⚠️ rejadan oshdi" : ""}\nQoldiq: <b>${left} ${picked.unit}</b>`
      : "";
    await send(chat_id, `✅ ${meta.emoji} <b>${picked.name}</b>: +${qty} ${picked.unit} · jami ${fmtMoney(qty * unitPrice)}${priceDiff}${tail}`, smetaMenu());
    session.flow = null;
    session.data = { ...(session.data ?? {}), smeta_pick: null, smeta_qty: null, smeta_unit_price: null };
    await saveSession(session);
    return;
  }




  if (
    text === "📊 Loyiha" ||
    text === "🏢 Firma / Loyiha" ||
    text === "🏢 Loyiha almashtirish" ||
    text === "/loyiha" ||
    text === "/Loyihalar" ||
    text === "/loyihalar" ||
    text === "🏗 Loyiha tanlash" ||
    text === "🏗 Loyiha tanlash /Loyihalar" ||
    /LOYIHANI\s+TANLANG/i.test(text) ||
    (text.startsWith("🏗 ") && (text.includes("/Loyihalar") || text.includes("O'zgartirish")))
  ) {
    await showProjectPicker(chat_id, null);
    return;
  }


  if (text === "↩️ Orqaga") {
    session.flow = null;
    session.data = { ...session.data, edit_index: null, bz: null };
    await saveSession(session);
    await send(chat_id, "↩️ Bosh menyu.", mainMenu(getDraft(session).length, session.chat_id));
    return;
  }

  // ---------- /setlocation: obyekt geofence sozlash (admin/pm/direktor) ----------
  if (text === "/setlocation" || text === "/setgeo") {
    const allowed = await checkAiAccess(uid);
    if (!allowed) {
      await send(chat_id, "❌ Sizda obyekt lokatsiyasini sozlash huquqi yo'q.");
      return;
    }
    if (!session.data?.project_id) {
      await send(chat_id, "❌ Avval loyihani tanlang.");
      await showProjectPicker(chat_id, null);
      return;
    }
    session.flow = "set_geo_radius";
    session.data = { ...session.data, pending_radius: null };
    await saveSession(session);
    const pname = session.data?.project_name ?? "—";
    await send(
      chat_id,
      `📍 <b>Obyekt lokatsiyasini sozlash</b>\n\nLoyiha: <b>${pname}</b>\n\n1️⃣ Avval geofence radiusini tanlang (obyekt chegarasi):`,
      {
        inline_keyboard: [
          [
            { text: "50 m", callback_data: "geor:50" },
            { text: "100 m", callback_data: "geor:100" },
            { text: "200 m", callback_data: "geor:200" },
          ],
          [
            { text: "300 m", callback_data: "geor:300" },
            { text: "500 m", callback_data: "geor:500" },
            { text: "1000 m", callback_data: "geor:1000" },
          ],
          [{ text: "✏️ Boshqa (qo'lda kiritish)", callback_data: "geor:custom" }],
          [{ text: "❌ Bekor", callback_data: "geor:cancel" }],
        ],
      }
    );
    return;
  }

  // /setlocation — radius qo'lda kiritish
  if (session.flow === "set_geo_radius_input" && text) {
    const r = parseInt(text.replace(/[^\d]/g, ""), 10);
    if (!r || r < 10 || r > 100000) {
      await send(chat_id, "❌ Noto'g'ri qiymat. 10–100000 oralig'idagi sonni kiriting (metrda).");
      return;
    }
    session.flow = "set_geo";
    session.data = { ...session.data, pending_radius: r };
    await saveSession(session);
    await send(
      chat_id,
      `✅ Radius: <b>${r} m</b>\n\n2️⃣ Endi obyekt joylashuvini belgilash uchun lokatsiyani ulashing.`,
      {
        keyboard: [
          [{ text: "📍 Joriy lokatsiyani yuborish", request_location: true }],
          [{ text: "↩️ Orqaga" }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      }
    );
    return;
  }


  // ---------- Davomat (attendance) ----------
  // Lokatsiya yuborilganda → bir xabarda Keldim/Ketdim/Bekor + izoh yozish (ixtiyoriy)
  if (msg.location) {
    const lat = msg.location.latitude;
    const lng = msg.location.longitude;

    // /setlocation flow: obyekt geofence ni saqlash
    if (session.flow === "set_geo" && session.data?.project_id) {
      const allowed = await checkAiAccess(uid);
      if (!allowed) {
        session.flow = null;
        await saveSession(session);
        await send(chat_id, "❌ Sizda bu amalni bajarish huquqi yo'q.");
        return;
      }
      const radius = Number(session.data?.pending_radius) || 200;
      // Eski (cached) lokatsiya bo'lib qolmasligi uchun avval tasdiqlatamiz
      session.flow = "set_geo_confirm";
      session.data = { ...session.data, pending_geo: { lat, lng, ts: Date.now() } };
      await saveSession(session);
      await send(
        chat_id,
        `📍 Qabul qilindi:\n<code>${lat.toFixed(6)}, ${lng.toFixed(6)}</code>\n📏 Radius: <b>${radius} m</b>\n\n⚠️ Telegram ba'zan eski (cached) lokatsiyani yuboradi. Iltimos, hozir <b>obyekt ustida</b> turganingizga ishonch hosil qiling va tasdiqlang.`,
        {
          inline_keyboard: [
            [{ text: "✅ Tasdiqlash va saqlash", callback_data: "geoc:ok" }],
            [{ text: "🔄 Qayta yuborish", callback_data: "geoc:redo" }],
            [{ text: "❌ Bekor", callback_data: "geoc:cancel" }],
          ],
        }
      );
      return;
    }



    session.flow = "att_choose";
    session.data = { ...session.data, pending_loc: { lat, lng, ts: Date.now() }, pending_note: null };
    await saveSession(session);
    await send(
      chat_id,
      `📍 Lokatsiya qabul qilindi.\n\nQuyidagi tugmalardan birini tanlang. Izoh qo'shmoqchi bo'lsangiz, avval «✏️ Izoh» tugmasini bosing:`,
      {
        inline_keyboard: [
          [
            { text: "🟢 Keldim", callback_data: "att:in" },
            { text: "🔴 Ketdim", callback_data: "att:out" },
          ],
          [
            { text: "✏️ Izoh", callback_data: "att:note" },
            { text: "❌ Bekor", callback_data: "att:cancel" },
          ],
        ],
      }
    );
    return;
  }

  // Foydalanuvchi izoh yozsa — saqlab qo'yamiz, tugma bosilishini kutamiz
  if (session.flow === "att_choose" && text) {
    session.data = { ...session.data, pending_note: text };
    await saveSession(session);
    await send(chat_id, `📝 Izoh saqlandi: "${text}"\n\nEndi 🟢 Keldim yoki 🔴 Ketdim tugmasini bosing.`);
    return;
  }


  // Loyiha tanlanmagan bo'lsa — har qanday bo'limga kirishni bloklash
  const sectionTexts = [
    "📋 Smeta", "💼 Buxgalteriya", "📦 Material qabul",
    "📦 Materiallar", "🔨 Ish turlari", "➕ Qo'shimcha (rejadan tashqari)",
    "🚚 Nakladnoy", "🚚 Noklodnoy", "📝 Buyurtma", "📝 Buyurtma (zayavka)", "📝 Zayavka",
    "📄 Shartnoma", "🧾 Faktura", "💸 To'lov so'rash",
  ];

  if (!session.data?.project_id && sectionTexts.includes(text)) {
    await send(
      chat_id,
      "⏳ Loyiha aniqlanmoqda...",
    );
    await showProjectPicker(chat_id, null);
    return;
  }

  // ===== Menyu navigatsiyasi =====
  if (text === "📋 Smeta") {
    await send(chat_id, "📋 <b>Smeta (B.O.Q):</b>\nQaysi bo'limni ko'rmoqchisiz?", smetaMenu());
    return;
  }
  if (text === "📦 Material qabul") {
    const pid = session.data?.project_id;
    if (!pid) { await send(chat_id, "❌ Avval loyihani tanlang."); await showProjectPicker(chat_id, null); return; }
    await showSmetaPicker(chat_id, "material", pid);
    return;
  }
  if (text === "➕ Yangi hisobot") {
    const pid = session.data?.project_id;
    if (!pid) { await send(chat_id, "❌ Avval loyihani tanlang."); await showProjectPicker(chat_id, null); return; }
    session.data = { ...(session.data ?? {}), dr: { project_id: pid } };
    session.flow = "dr";
    session.step = "pick";
    await saveSession(session);
    await drShowItems(chat_id, pid);
    return;
  }
  if (text === "💼 Buxgalteriya") {
    await send(chat_id, "💼 <b>Buxgalteriya:</b>", buxMenu());
    return;
  }
  if (text === "↩️ Orqaga") {
    await send(chat_id, "🏠 Asosiy menyu", mainMenu(getDraft(session).length, chat_id));
    return;
  }

  // ===== Smeta picker (item tanlash) =====
  if (text === "📦 Materiallar" || text === "🔨 Ish turlari" || text === "➕ Yordamchi" || text === "➕ Qo'shimcha (rejadan tashqari)") {
    const pid = session.data?.project_id;
    if (!pid) { await send(chat_id, "❌ Avval loyihani tanlang."); await showProjectPicker(chat_id, null); return; }
    const scope = text === "📦 Materiallar" ? "material" : text === "🔨 Ish turlari" ? "work" : "off_plan";
    await showSmetaPicker(chat_id, scope, pid);
    return;
  }

  // ===== Buxgalteriya bo'limlari =====
  if (text === "🚚 Nakladnoy" || text === "🚚 Noklodnoy") {
    await nkStart(session);
    return;
  }
  if (text === "📝 Buyurtma" || text === "📝 Buyurtma (zayavka)" || text === "📝 Zayavka") {
    await bzStart(session);
    return;
  }
  if (text === "📄 Shartnoma") {
    await shStart(session);
    return;
  }
  if (text === "🧾 Faktura") {
    const pid = session.data?.project_id;
    const { data } = await admin()
      .from("project_zayavka")
      .select("name,invoice_no,invoice_date,total,paid_amount,supplier_name")
      .eq("project_id", pid)
      .not("invoice_no", "is", null)
      .order("invoice_date", { ascending: false })
      .limit(50);
    const rows = (data ?? []) as any[];
    if (!rows.length) { await send(chat_id, "🧾 <b>Fakturalar</b>\n\n— hozircha yo'q —"); return; }
    const lines = rows.map((r, i) => {
      const t = Number(r.total) || 0;
      const p = Number(r.paid_amount) || 0;
      const left = Math.max(0, t - p);
      return `${i + 1}. №${r.invoice_no} · ${r.invoice_date ?? "—"}\n   ${r.name} · ${r.supplier_name ?? "—"}\n   💰 ${fmtMoney(t)} · to'langan: ${fmtMoney(p)}${left > 0 ? ` · qoldiq: <b>${fmtMoney(left)}</b>` : " ✅"}`;
    });
    await send(chat_id, `🧾 <b>Fakturalar (${rows.length})</b>\n\n${lines.join("\n\n")}`);
    return;
  }
  if (text === "💸 To'lov so'rash") {
    const pid = session.data?.project_id;
    const { data } = await admin()
      .from("project_zayavka")
      .select("name,qty,unit_price,total,paid_amount,supplier_name,workflow_status")
      .eq("project_id", pid)
      .in("workflow_status", ["delivered", "invoiced"])
      .order("created_at", { ascending: false })
      .limit(50);
    const pending = ((data ?? []) as any[]).filter((r) => {
      const t = Number(r.total) || Number(r.qty) * Number(r.unit_price) || 0;
      const p = Number(r.paid_amount) || 0;
      return t > p;
    });
    if (!pending.length) { await send(chat_id, "💸 <b>To'lov kutilayotganlar</b>\n\n✅ Hammasi to'langan."); return; }
    const lines = pending.map((r, i) => {
      const t = Number(r.total) || Number(r.qty) * Number(r.unit_price) || 0;
      const p = Number(r.paid_amount) || 0;
      const left = t - p;
      return `${i + 1}. ${r.name} · ${r.supplier_name ?? "—"}\n   Qoldiq: <b>${fmtMoney(left)}</b> so'm`;
    });
    await send(chat_id, `💸 <b>To'lov kutilayotganlar (${pending.length})</b>\n\n${lines.join("\n\n")}`);
    return;
  }

  // ---------- Shartnoma ketma-ket flow ----------
  if (session.flow === "bux_shartnoma") {
    await shHandle(session, msg, text);
    return;
  }

  // ---------- Nakladnoy oqimi (erkin: photo + matn/ovoz, har qanday tartibda) ----------
  if (session.flow === "bux_nakladnoy") {
    const st = nkGetState(session);
    const step = st.step;
    const photoFid = msg.photo?.length ? msg.photo[msg.photo.length - 1].file_id : null;
    const docImg = msg.document && (msg.document.mime_type ?? "").startsWith("image/");

    // Photo (any time during input)
    if ((step === "input" || step === "photo") && (photoFid || docImg)) {
      const fid = photoFid ?? msg.document.file_id;
      const f = await uploadFile(fid, `nakladnoy-tmp`);
      if (!f) { await send(chat_id, "❌ Rasm yuklab olinmadi. Qayta yuboring."); return; }
      try {
        const ext = (f.mime.includes("png") ? "png" : "jpg");
        const key = `photo/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
        const sb = admin();
        await sb.storage.from("nakladnoy").upload(key, f.bytes, { contentType: f.mime });
        st.photo_url = sb.storage.from("nakladnoy").getPublicUrl(key).data.publicUrl;
        st.photo_mime = f.mime;
      } catch {
        st.photo_url = f.url; st.photo_mime = f.mime;
      }
      nkSetState(session, st); await saveSession(session);
      const hasItems = (st.items?.length ?? 0) > 0;
      await send(chat_id, `✅ Rasm qabul qilindi.${hasItems ? "" : " Endi matn yoki 🎤 ovoz orqali ta'minotchi, № va materiallarni ayting."}`, hasItems ? {
        inline_keyboard: [[{ text: "✅ Tasdiqlash (Preview)", callback_data: "nk:more:no" }], [{ text: "↩️ Bekor", callback_data: "nk:cancel" }]],
      } : undefined);
      return;
    }

    if (step === "input") {
      let raw = text;
      if (!raw && (msg.voice || msg.audio)) {
        const fid = msg.voice?.file_id ?? msg.audio?.file_id;
        const f = await uploadFile(fid, `voice/nakladnoy`);
        if (f) {
          await send(chat_id, "🎧 Ovoz tinglanmoqda...");
          raw = (await transcribeAudio(f.bytes, f.mime)) ?? "";
        }
      }
      if (!raw) { await send(chat_id, "📝 Rasm, matn yoki 🎤 ovoz yuboring."); return; }
      await tg("sendChatAction", { chat_id, action: "typing" });
      const parsed = await aiParseNakladnoy(raw);
      if (!parsed.items.length && !parsed.supplier && !parsed.nakladnoy_no) {
        await send(chat_id, "⚠️ Tushuna olmadim. Aniqroq ayting: loyiha, ta'minotchi, №, va materiallar (masalan: «Yunusobod loyihasi, FORTIS dan, № 1234, 5 qop sement 65000 dan»)."); return;
      }
      if (!st.project_id) {
        const proj = await detectProjectFromText(raw, session.data?.project_id ?? null);
        if (proj) { st.project_id = proj.id; st.project_name = proj.name; }
      }
      if (parsed.supplier) st.supplier = parsed.supplier;
      if (parsed.nakladnoy_no) st.nakladnoy_no = parsed.nakladnoy_no;
      st.items = [...(st.items ?? []), ...parsed.items];
      nkSetState(session, st); await saveSession(session);
      const added = parsed.items.map((it: any, i: number) => `${i + 1}. ${it.name} — ${it.qty} ${it.unit} × ${fmtMoney(it.unit_price)}`).join("\n") || "(materiallar yo'q)";
      await send(chat_id,
        `✅ AI tushundi:\n🏗 Loyiha: <b>${st.project_name ?? "—"}</b>\n🏭 Ta'minotchi: <b>${st.supplier ?? "—"}</b>\n🔢 №: <b>${st.nakladnoy_no ?? "—"}</b>\n🖼 Rasm: ${st.photo_url ? "✅" : "—"}\n\n${added}\n\n<b>Jami: ${st.items.length} qator</b>${!st.project_id ? "\n\n⚠️ Loyiha aniqlanmadi — tasdiqlashdan oldin loyiha nomini ham yozing." : ""}`,
        { inline_keyboard: [
            [{ text: "➕ Yana qo'shish", callback_data: "nk:more:yes" }, { text: "✅ Tasdiqlash (Preview)", callback_data: "nk:more:no" }],
            [{ text: "↩️ Bekor", callback_data: "nk:cancel" }],
          ] });
      return;
    }
    await send(chat_id, "ℹ️ Rasm, matn yoki ovoz yuboring.");
    return;
  }

  // ---------- Buxgalteriya zayavka oqimi (erkin AI input) ----------
  if (session.flow === "bux_zayavka") {
    const st = bzGetState(session);
    const step = st.step;
    if (step === "date" && text) {
      if (!text.match(/^\d{4}-\d{2}-\d{2}$/)) { await send(chat_id, "❌ Sana formati: YYYY-MM-DD"); return; }
      st.date = text; st.step = "project";
      bzSetState(session, st); await saveSession(session);
      await bzShowProjects(chat_id);
      return;
    }
    if (step === "items_input") {
      let raw = text;
      if (!raw && (msg.voice || msg.audio)) {
        const fid = msg.voice?.file_id ?? msg.audio?.file_id;
        const f = await uploadFile(fid, `voice/zayavka`);
        if (f) {
          await send(chat_id, "🎧 Ovoz tinglanmoqda...");
          raw = (await transcribeAudio(f.bytes, f.mime)) ?? "";
        }
      }
      if (!raw) { await send(chat_id, "📝 Matn yoki 🎤 ovoz yuboring."); return; }
      await tg("sendChatAction", { chat_id, action: "typing" });
      // Loyihani aniqlash
      if (!st.project_id) {
        const proj = await detectProjectFromText(raw, session.data?.project_id ?? null);
        if (!proj) { await send(chat_id, "⚠️ Loyiha aniqlanmadi. Loyiha nomini ham ayting (masalan: «Yunusobod loyihasi uchun ...»)."); return; }
        st.project_id = proj.id;
        st.project_name = proj.name;
      }
      const parsed = await aiParseZayavkaItems(raw);
      if (!parsed.length) { await send(chat_id, "⚠️ Materiallarni tushunmadim. Aniqroq yozing (masalan: «50 qop sement, 200 dona g'isht»)."); return; }
      st.items = [...(st.items ?? []), ...parsed];
      bzSetState(session, st); await saveSession(session);
      const added = parsed.map((it: any, i: number) => `${i + 1}. ${it.name} — ${it.qty} ${it.unit}${it.location ? ` · 📍 ${it.location}` : ""}`).join("\n");
      await send(chat_id, `✅ 🏗 <b>${st.project_name}</b>\n<b>Qo'shildi (${parsed.length} ta):</b>\n${added}\n\n<b>Jami: ${st.items.length} qator</b>`, {
        inline_keyboard: [
          [{ text: "➕ Yana qo'shish", callback_data: "bz:more:yes" }, { text: "✅ Tugatish (Preview)", callback_data: "bz:more:no" }],
          [{ text: "↩️ Bekor", callback_data: "bz:cancel" }],
        ],
      });
      return;
    }
    await send(chat_id, "ℹ️ Tugmani bosing yoki matn/ovoz yuboring.");
    return;
  }

  if (/^(📒\s*)?daftar/i.test(text) || text === "/daftar" || text === "📋 Draft" || text.startsWith("📋 Draft") || text === "/draft") {
    if (!canUseButton(chat_id, "ledger")) {
      await send(chat_id, "⛔ Bu bo'lim sizga biriktirilmagan.", mainMenu(getDraft(session).length, chat_id));
      return;
    }
    await showDaftar(session);
    return;
  }

  if (text === "✅ Tasdiqlash" || text === "/tasdiq") {
    if (!getDraft(session).length) {
      await send(chat_id, "Daftar bo'sh — hech narsa saqlanmadi.", mainMenu(0, chat_id));
      return;
    }
    await showDaftar(session);
    return;
  }

  if (text === "🗑 Daftarni tozalash" || text === "🗑 Draftni tozalash" || text === "/tozalash") {
    session.data = { ...session.data, draft: [] };
    await saveSession(session);
    await send(chat_id, "🗑 Daftar tozalandi.", mainMenu(0, chat_id));
    return;
  }

  // ---------- AI Chat rejimi (faqat /ai komandasi orqali, admin/PM/CEO) ----------
  if (text === "/ai" || text === "✨ Fina") {
    if (aiAllowedByChat.get(chat_id) !== true || !canUseButton(chat_id, "innoai")) {
      await send(chat_id, "⛔ Bu bo'lim faqat <b>Admin</b>, <b>PM</b> va <b>CEO (Direktor)</b> uchun.", mainMenu(getDraft(session).length, chat_id));
      return;
    }
    session.flow = "ai_chat";
    session.data = { ...session.data, chat_history: [] };
    await saveSession(session);
    await send(
      chat_id,
      "Salom, men <b>Fina</b>man — sizning sevimli yordamchingizman.\n\nLoyihalar bo'yicha ma'lumotlar va hisobot beraman.",
      chatMenu()
    );
    return;
  }


  if (session.flow === "ai_chat") {
    await runAiChat(session, msg, text, ceoOnlyByChat.get(chat_id) === true);
    return;
  }


  if (!session.data?.project_id) {
    await send(chat_id, "Avval loyihani tanlang.");
    await showFirmPicker(chat_id);
    return;
  }


  // Ovoz
  if (msg.voice || msg.audio) {
    const fileId = msg.voice?.file_id ?? msg.audio?.file_id;
    const f = await uploadFile(fileId, `voice/auto`);
    if (!f) { await send(chat_id, "❌ Audio yuklab olinmadi."); return; }
    await send(chat_id, "🎧 Ovoz tinglanmoqda...");
    const transcript = await transcribeAudio(f.bytes, f.mime);
    if (!transcript) {
      await send(chat_id, "⚠️ Ovozni tushuna olmadim. Yozma yuboring.", mainMenu(getDraft(session).length, session.chat_id));
      return;
    }
    if (await tryDaftarCommand(session, transcript)) return;
    if (isEditIntent(transcript.toLocaleLowerCase("uz"))) {
      await send(chat_id, "⚠️ Qaysi yozuvni o'zgartirishni tushunmadim. Qator raqamini ayting (masalan: «2-qator summasi 350 ming»).", mainMenu(getDraft(session).length, chat_id));
      return;
    }
    const items = await aiParse(transcript, null);
    await addToDraft(session, items, { source: "telegram_voice", note: `🎤 "${transcript.slice(0, 200)}"` });
    return;
  }

  // Rasm
  const photoFileId = msg.photo?.length ? msg.photo[msg.photo.length - 1].file_id : null;
  const docIsImage = msg.document && (msg.document.mime_type ?? "").startsWith("image/");
  if (photoFileId || docIsImage) {
    const fileId = photoFileId ?? msg.document.file_id;
    const f = await uploadFile(fileId, `image/auto`);
    if (!f) { await send(chat_id, "❌ Rasm yuklab olinmadi."); return; }
    const cap = (msg.caption ?? "").toString().trim();
    await send(chat_id, "🖼 Rasm o'qilmoqda...");
    const items = await aiParse(cap || null, f.dataUrl);
    await addToDraft(session, items, {
      source: "telegram_photo",
      note: `🖼 Rasm${cap ? ` — "${cap.slice(0, 200)}"` : ""}`,
    });
    return;
  }

  // Matn
  if (text) {
    if (await tryDaftarCommand(session, text)) return;
    if (getDraft(session).length && isEditIntent(text.toLocaleLowerCase("uz"))) {
      await send(chat_id, "⚠️ Qaysi yozuvni o'zgartirishni tushunmadim. Qator raqamini ayting (masalan: «2-qator summasi 350 ming»).", mainMenu(getDraft(session).length, chat_id));
      return;
    }
    const items = await aiParse(text, null);
    await addToDraft(session, items, { source: "telegram_text", note: `💬 "${text.slice(0, 200)}"` });
    return;
  }

  await send(chat_id, "📝 Matn, 🎤 ovoz yoki 🖼 rasm yuboring.", mainMenu(getDraft(session).length, session.chat_id));
}

async function handleCallback(cb: any) {
  const chat_id = cb.message?.chat?.id;
  const message_id = cb.message?.message_id;
  const data: string = cb.data ?? "";
  const uid = cb.from?.id ?? chat_id;
  const username = cb.from?.username ?? cb.from?.first_name ?? null;
  if (!chat_id) return;

  // ===== Foydalanuvchi boshqaruvi callback'lari =====
  if (await tryHandleUserAdminCallback(cb)) return;

  // 🔒 Whitelist tekshiruvi
  if (!(await isAllowedTgUser(uid))) {
    await answerCb(cb.id, "🚫 Ruxsat yo'q");
    return;
  }

  const session = await getSession(chat_id, uid, username);
  buttonAccessByChat.set(chat_id, await loadButtonAccess(chat_id, uid));

  // ===== Kunlik hisobot callback'lari =====
  if (data.startsWith("dr:")) {
    if (await drHandleCallback(session, cb, data)) return;
    // dr:field — qo'shimcha ma'lumot so'rovlari
    if (data.startsWith("dr:field:")) {
      await drHandleField(session, cb, data.slice("dr:field:".length));
      return;
    }
    await answerCb(cb.id);
    return;
  }

  // ===== /setlocation radius tanlash =====
  if (data.startsWith("geor:")) {
    const val = data.slice("geor:".length);
    if (val === "cancel") {
      session.flow = null;
      session.data = { ...(session.data ?? {}), pending_radius: null };
      await saveSession(session);
      await editText(chat_id, message_id, "❌ Bekor qilindi.");
      await answerCb(cb.id);
      return;
    }
    if (val === "custom") {
      session.flow = "set_geo_radius_input";
      await saveSession(session);
      await editText(chat_id, message_id, "✏️ Radiusni metrda kiriting (masalan: <b>150</b>):");
      await answerCb(cb.id);
      return;
    }
    const r = parseInt(val, 10);
    if (!r) { await answerCb(cb.id, "Xato"); return; }
    session.flow = "set_geo";
    session.data = { ...(session.data ?? {}), pending_radius: r };
    await saveSession(session);
    await editText(chat_id, message_id, `✅ Radius: <b>${r} m</b>\n\n2️⃣ Endi obyekt lokatsiyasini ulashing.`);
    await send(
      chat_id,
      `📍 Joriy lokatsiyani yuborish uchun tugmani bosing:`,
      {
        keyboard: [
          [{ text: "📍 Joriy lokatsiyani yuborish", request_location: true }],
          [{ text: "↩️ Orqaga" }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      }
    );
    await answerCb(cb.id);
    return;
  }

  // ===== /setlocation lokatsiyani tasdiqlash =====
  if (data.startsWith("geoc:")) {
    const act = data.slice("geoc:".length);
    if (act === "cancel") {
      session.flow = null;
      session.data = { ...(session.data ?? {}), pending_geo: null, pending_radius: null };
      await saveSession(session);
      await editText(chat_id, message_id, "❌ Bekor qilindi.");
      await answerCb(cb.id);
      return;
    }
    if (act === "redo") {
      session.flow = "set_geo";
      session.data = { ...(session.data ?? {}), pending_geo: null };
      await saveSession(session);
      await editText(chat_id, message_id, "🔄 Telegramda lokatsiyani <b>qaytadan</b> yuboring.\n\n💡 Maslahat: avval xaritani ochib joyni yangilang, so'ng «Send My Current Location» tugmasini bosing.");
      await send(chat_id, "📍 Lokatsiyani yuboring:", {
        keyboard: [
          [{ text: "📍 Joriy lokatsiyani yuborish", request_location: true }],
          [{ text: "↩️ Orqaga" }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      });
      await answerCb(cb.id);
      return;
    }
    if (act === "ok") {
      const pg = session.data?.pending_geo;
      if (!pg || !session.data?.project_id) {
        await answerCb(cb.id, "Lokatsiya topilmadi");
        return;
      }
      const allowed = await checkAiAccess(uid);
      if (!allowed) {
        await answerCb(cb.id, "Ruxsat yo'q");
        return;
      }
      const radius = Number(session.data?.pending_radius) || 200;
      const { error } = await admin()
        .from("projects")
        .update({ geo_lat: pg.lat, geo_lng: pg.lng, geo_radius_m: radius })
        .eq("id", session.data.project_id);
      session.flow = null;
      session.data = { ...session.data, pending_geo: null, pending_radius: null };
      await saveSession(session);
      if (error) {
        await editText(chat_id, message_id, `❌ Saqlashda xatolik: ${error.message}`);
        await answerCb(cb.id);
        return;
      }
      const pname = session.data?.project_name ?? "—";
      await editText(chat_id, message_id, `✅ Obyekt lokatsiyasi saqlandi.\n🏗 <b>${pname}</b>\n📍 ${pg.lat.toFixed(6)}, ${pg.lng.toFixed(6)}\n📏 Chegara: ${radius} m`);
      await send(chat_id, "Bosh menyu:", mainMenu(getDraft(session).length, session.chat_id));
      await answerCb(cb.id, "Saqlandi");
      return;
    }
  }





  // ===== Davomat (attendance) inline callbacks =====
  if (data === "att:note") {
    const pl = session.data?.pending_loc;
    if (!pl?.lat || !pl?.lng) {
      await editText(chat_id, message_id, "⚠️ Lokatsiya topilmadi. Yana lokatsiya yuboring.");
      await answerCb(cb.id);
      return;
    }
    session.flow = "att_choose";
    await saveSession(session);
    await send(chat_id, "✏️ Izohni yozib yuboring (bitta xabar).");
    await answerCb(cb.id);
    return;
  }
  if (data === "att:in" || data === "att:out" || data === "att:cancel") {
    if (data === "att:cancel") {
      session.data = { ...(session.data ?? {}), pending_loc: null };
      session.flow = null;
      await saveSession(session);
      await editText(chat_id, message_id, "❌ Bekor qilindi.");
      await answerCb(cb.id);
      return;
    }
    const pl = session.data?.pending_loc;
    if (!pl?.lat || !pl?.lng) {
      await editText(chat_id, message_id, "⚠️ Lokatsiya topilmadi. Yana lokatsiya yuboring.");
      await answerCb(cb.id);
      return;
    }
    const kind = data === "att:in" ? "check_in" : "check_out";
    const label = kind === "check_in" ? "🟢 Keldim" : "🔴 Ketdim";
    await editText(chat_id, message_id, `${label} — qayd etilmoqda...`);
    const note = (session.data?.pending_note as string | null) ?? null;
    await handleAttendanceLocation(session, { latitude: pl.lat, longitude: pl.lng }, kind, note);
    await answerCb(cb.id);
    return;
  }


  // ===== Buxgalteriya zayavka callbacks =====
  if (data === "sh:cancel") {
    session.flow = null;
    session.data = { ...(session.data ?? {}), sh: null };
    await saveSession(session);
    await editText(chat_id, message_id, "❌ Bekor qilindi.");
    await send(chat_id, "↩️ Bosh menyu.", mainMenu(getDraft(session).length, session.chat_id));
    await answerCb(cb.id);
    return;
  }

  if (data.startsWith("bz:")) {
    const rest = data.slice(3);
    if (rest === "cancel") {
      session.flow = null;
      session.data = { ...(session.data ?? {}), bz: null };
      await saveSession(session);
      await editText(chat_id, message_id, "❌ Bekor qilindi.");
      await send(chat_id, "↩️ Bosh menyu.", mainMenu(getDraft(session).length, session.chat_id));
      await answerCb(cb.id);
      return;
    }
    const st = bzGetState(session);
    if (rest.startsWith("date:")) {
      const v = rest.slice(5);
      if (v === "custom") {
        await editText(chat_id, message_id, "📅 Sanani kiriting (YYYY-MM-DD):");
        st.step = "date";
        bzSetState(session, st);
        await saveSession(session);
        await answerCb(cb.id);
        return;
      }
      st.date = v;
      st.step = "project";
      bzSetState(session, st);
      await saveSession(session);
      await editText(chat_id, message_id, `✅ Sana: ${dateLabel(v)}`);
      await bzShowProjects(chat_id);
      await answerCb(cb.id);
      return;
    }
    if (rest.startsWith("proj:")) {
      const pid = rest.slice(5);
      const { data: p } = await admin().from("projects").select("name").eq("id", pid).maybeSingle();
      st.project_id = pid;
      st.project_name = (p as any)?.name ?? "";
      st.items = [];
      bzSetState(session, st);
      await saveSession(session);
      await editText(chat_id, message_id, `✅ Loyiha: <b>${st.project_name}</b>`);
      await bzAskItems(session);
      await answerCb(cb.id);
      return;
    }
    if (rest === "more:yes") {
      st.step = "items_input";
      bzSetState(session, st);
      await saveSession(session);
      await editText(chat_id, message_id, "➕ Yana materiallarni yuboring (matn yoki ovoz).");
      await answerCb(cb.id);
      return;
    }
    if (rest === "more:no") {
      await editText(chat_id, message_id, "📋 Preview");
      await bzShowPreview(session);
      await answerCb(cb.id);
      return;
    }
    if (rest === "confirm") {
      await editText(chat_id, message_id, "⏳ Saqlanmoqda...");
      await bzPersist(session);
      await answerCb(cb.id, "Saqlandi");
      return;
    }
    await answerCb(cb.id);
    return;
  }

  // ===== Nakladnoy callbacks =====
  if (data.startsWith("nk:")) {
    const rest = data.slice(3);
    if (rest === "cancel") {
      session.flow = null;
      session.data = { ...(session.data ?? {}), nk: null };
      await saveSession(session);
      await editText(chat_id, message_id, "❌ Bekor qilindi.");
      await send(chat_id, "↩️ Bosh menyu.", mainMenu(getDraft(session).length, session.chat_id));
      await answerCb(cb.id);
      return;
    }
    const st = nkGetState(session);
    if (rest.startsWith("date:")) {
      const v = rest.slice(5);
      if (v === "custom") {
        await editText(chat_id, message_id, "📅 Sanani kiriting (YYYY-MM-DD):");
        st.step = "date"; nkSetState(session, st); await saveSession(session);
        await answerCb(cb.id); return;
      }
      st.date = v; st.step = "project";
      nkSetState(session, st); await saveSession(session);
      await editText(chat_id, message_id, `✅ Sana: ${v}`);
      await nkShowProjects(chat_id);
      await answerCb(cb.id); return;
    }
    if (rest.startsWith("proj:")) {
      const pid = rest.slice(5);
      const { data: p } = await admin().from("projects").select("name").eq("id", pid).maybeSingle();
      st.project_id = pid;
      st.project_name = (p as any)?.name ?? "";
      st.step = "input";
      nkSetState(session, st); await saveSession(session);
      await editText(chat_id, message_id, `✅ Loyiha: <b>${st.project_name}</b>`);
      await nkAskInput(session);
      await answerCb(cb.id); return;
    }
    if (rest === "more:yes") {
      st.step = "input";
      nkSetState(session, st); await saveSession(session);
      await editText(chat_id, message_id, "➕ Yana ma'lumot yuboring (rasm/matn/ovoz).");
      await answerCb(cb.id); return;
    }
    if (rest === "more:no") {
      await editText(chat_id, message_id, "📋 Preview");
      await nkShowPreview(session);
      await answerCb(cb.id); return;
    }
    if (rest === "confirm") {
      await editText(chat_id, message_id, "⏳ Saqlanmoqda...");
      await nkPersist(session);
      await answerCb(cb.id, "Saqlandi");
      return;
    }
    await answerCb(cb.id); return;
  }

  // Firma tanlash
  if (data.startsWith("firm:")) {
    const v = data.slice(5);
    if (v === "back") {
      await showFirmPicker(chat_id);
      await answerCb(cb.id);
      return;
    }
    const firm_id = v === "all" ? null : v;
    await editText(chat_id, message_id, firm_id ? "✅ Firma tanlandi" : "✅ Barcha firmalar");
    await showProjectPicker(chat_id, firm_id);
    await answerCb(cb.id);
    return;
  }

  // Loyiha tanlash
  if (data.startsWith("proj:")) {
    const project_id = data.slice(5);
    const { data: p } = await admin().from("projects").select("name").eq("id", project_id).maybeSingle();
    session.data = { ...(session.data ?? {}), project_id, project_name: p?.name ?? "" };
    if (p?.name) projectNameByChat.set(chat_id, p.name);
    await saveSession(session);
    await editText(chat_id, message_id, `✅ Loyiha tanlandi: <b>${p?.name ?? ""}</b>`);
    await send(
      chat_id,
      `🏗 <b>${p?.name ?? ""}</b>\n\nEndi yozing/ovoz/rasm yuboring — AI tushunadi va draftga qo'shadi.\n\n<i>Misol:</i>\n• «Benzinga 200 ming berdim»\n• «5 qop sement keldi 65000 dan»\n• «50 qop sement kerak»`,
      mainMenu(getDraft(session).length, session.chat_id)
    );
    await answerCb(cb.id);
    return;
  }

  // Draftni tasdiqlash
  if (data === "draft:confirm") {
    const result = await persistDraft(session);
    await editText(chat_id, message_id, result);
    await send(chat_id, "✅ Tayyor. Yangi yozuv uchun yozing.", mainMenu(0, chat_id));
    await answerCb(cb.id, "Saqlandi");
    return;
  }
  if (data === "draft:clear") {
    session.data = { ...session.data, draft: [], edit_index: null };
    session.flow = null;
    await saveSession(session);
    await editText(chat_id, message_id, "🗑 Daftar tozalandi.");
    await send(chat_id, "Yangi yozuv uchun yozing.", mainMenu(0, chat_id));
    await answerCb(cb.id, "Tozalandi");
    return;
  }

  // Daftar — view / pick mode
  if (data === "daftar:view") {
    await showDaftar(session, message_id, "view");
    await answerCb(cb.id);
    return;
  }
  if (data === "daftar:pick:edit") {
    await showDaftar(session, message_id, "edit");
    await answerCb(cb.id);
    return;
  }
  if (data === "daftar:pick:del") {
    await showDaftar(session, message_id, "del");
    await answerCb(cb.id);
    return;
  }

  // Item — o'chirish
  if (data.startsWith("item:del:")) {
    const idx = parseInt(data.slice(9), 10);
    const draft = getDraft(session);
    if (Number.isFinite(idx) && idx >= 0 && idx < draft.length) {
      const next = draft.filter((_, i) => i !== idx);
      session.data = { ...session.data, draft: next };
      await saveSession(session);
      await showDaftar(session, message_id);
      await answerCb(cb.id, "O'chirildi");
      return;
    }
    await answerCb(cb.id, "Topilmadi");
    return;
  }

  // Item — tahrir (matn bilan to'g'irlash)
  if (data.startsWith("item:edit:")) {
    const idx = parseInt(data.slice(10), 10);
    const draft = getDraft(session);
    if (Number.isFinite(idx) && idx >= 0 && idx < draft.length) {
      session.flow = "edit_item";
      session.data = { ...session.data, edit_index: idx };
      await saveSession(session);
      const it = draft[idx];
      // Tahrirlanadigan asl matn (yoki yozuvdan tiklangan)
      const note: string = (it._source_note ?? "").toString();
      const m = note.match(/"([^"]+)"/);
      let editable = m ? m[1] : "";
      if (!editable) {
        if (it.kind === "material") editable = `${it.name ?? ""} ${it.qty ?? ""} ${it.unit ?? ""} ${it.unit_price ? Number(it.unit_price) + " dan" : ""}`.trim();
        else if (it.kind === "zayavka") editable = `${it.name ?? ""} ${it.qty ?? ""} ${it.unit ?? ""} kerak`.trim();
        else editable = `${it.description ?? it.category ?? ""} ${it.amount ? Number(it.amount) : ""}`.trim();
      }
      await send(
        chat_id,
        `✏️ <b>#${idx + 1}-yozuvni tahrirlash</b>\n\n${renderItem(it, idx + 1)}\n\n📝 Pastdagi matnni nusxalab, to'g'irlab qayta yuboring:`,
        { inline_keyboard: [[{ text: "↩️ Bekor qilish", callback_data: "edit:cancel" }]] }
      );
      await send(chat_id, `<code>${editable.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</code>`);
      await answerCb(cb.id);
      return;
    }
    await answerCb(cb.id, "Topilmadi");
    return;
  }

  if (data === "edit:cancel") {
    session.flow = null;
    session.data = { ...session.data, edit_index: null };
    await saveSession(session);
    await editText(chat_id, message_id, "↩️ Tahrir bekor qilindi.");
    await showDaftar(session);
    await answerCb(cb.id);
    return;
  }

  await answerCb(cb.id);
}

// ================= Kunlik hisobot (Daily Report) — bot oqimi =================
// Rol: faqat prorab / pm / admin / finans. Boshqalar uchun "📋 Kunlik hisobot" ishlamaydi.


function drMenu() {
  return {
    keyboard: [
      [{ text: "➕ Yangi hisobot" }],
      [{ text: "📦 Material qabul" }],
      [{ text: "↩️ Orqaga" }],
    ],
    resize_keyboard: true,
  };
}

// ---- Excel / daftar rasmi orqali ommaviy import ----
type DrImportLine = {
  zayavka_id: string | null;
  name: string;
  unit: string | null;
  qty: number;
  brigade_name?: string | null;
  workers_count?: number | null;
  equipment_name?: string | null;
  equipment_hours?: number | null;
  note?: string | null;
};

async function excelToText(bytes: Uint8Array): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array" });
  const parts: string[] = [];
  for (const sn of wb.SheetNames.slice(0, 3)) {
    const ws = wb.Sheets[sn];
    if (!ws) continue;
    parts.push(`### ${sn}\n${XLSX.utils.sheet_to_csv(ws)}`);
  }
  return parts.join("\n\n").slice(0, 12000);
}

async function drImportFile(
  session: Session,
  chat_id: number,
  project_id: string,
  file_id: string,
  file_name: string,
  mime: string,
) {
  await send(chat_id, "⏳ Fayl o'qilmoqda, biroz kuting...");
  const f = await uploadFile(file_id, "daily-report");
  if (!f) { await send(chat_id, "⚠️ Faylni yuklab bo'lmadi. Qayta yuboring."); return; }

  const isExcel =
    /\.(xlsx|xls|csv)$/i.test(file_name) ||
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "text/csv";

  const { data: boq } = await admin()
    .from("project_zayavka")
    .select("id,name,unit,kind")
    .eq("project_id", project_id)
    .is("parent_id", null)
    .in("kind", ["work", "ustalar"])
    .limit(300);
  const boqList = ((boq ?? []) as any[])
    .map((b) => `${b.id}|${b.name} (${b.unit ?? "-"}) [${b.kind}]`)
    .join("\n");

  const systemPrompt = `Sen qurilish loyihasi kunlik hisobotini o'qiydigan AI san.
Foydalanuvchi Excel jadval matni yoki daftarga qo'lda yozilgan hisobot rasmini yuboradi (o'zbek/rus tilida).
DIQQAT: faqat BAJARILGAN ISH va USTALAR satrlarini ol. Material qabul (olingan material, narx, nakladnoy) satrlarini butunlay TASHLA.
Har bir satrni o'qib JSON qaytar:
{"lines":[{"zayavka_id":"BOQ id yoki null","name":"ish/material nomi","unit":"birlik yoki null","qty":son,"brigade_name":null,"workers_count":null,"equipment_name":null,"equipment_hours":null,"note":null}],"issues":null,"notes":null}
Qoidalar:
- Har bir satr uchun quyidagi BOQ ro'yxatidan eng mos qatorni topib zayavka_id ni yoz. Mos kelmasa null.
- qty — bugun bajarilgan hajm (faqat son).
- Sarlavha, jami/итого satrlarini tashla.
- Muammolar bo'lsa issues ga, umumiy izoh notes ga yoz.
- Faqat JSON qaytar.

BOQ ro'yxati (id|nom (birlik) [tur]):
${boqList || "(bo'sh)"}`;

  const userParts: any[] = isExcel
    ? [{ type: "text", text: `Excel hisobot matni:\n${await excelToText(f.bytes)}` }]
    : [
        { type: "text", text: "Daftarga yozilgan kunlik hisobot rasmi. O'qib JSON qaytar." },
        { type: "image_url", image_url: { url: f.dataUrl } },
      ];

  const parsed = await callAi(systemPrompt, userParts);
  const rawLines: any[] = Array.isArray(parsed?.lines) ? parsed.lines : [];
  const lines: DrImportLine[] = rawLines
    .map((l) => ({
      zayavka_id: typeof l?.zayavka_id === "string" && l.zayavka_id.length > 20 ? l.zayavka_id : null,
      name: String(l?.name ?? "").trim(),
      unit: l?.unit ? String(l.unit) : null,
      qty: Number(l?.qty) || 0,
      brigade_name: l?.brigade_name ? String(l.brigade_name) : null,
      workers_count: Number(l?.workers_count) || null,
      equipment_name: l?.equipment_name ? String(l.equipment_name) : null,
      equipment_hours: Number(l?.equipment_hours) || null,
      note: l?.note ? String(l.note) : null,
    }))
    .filter((l) => l.name && l.qty > 0);

  if (!lines.length) {
    await send(chat_id, `⚠️ Hisobotni o'qib bo'lmadi.${lastAiError ? `\n${lastAiError}` : ""}\nJadval ustunlari: nomi | birlik | hajm bo'lsin yoki rasm aniqroq bo'lsin.`);
    return;
  }

  session.flow = "dr";
  session.step = "import";
  session.data = {
    ...(session.data ?? {}),
    dr: {
      ...(session.data?.dr ?? {}),
      project_id,
      _pending: "none",
      import: {
        lines,
        issues: parsed?.issues ? String(parsed.issues) : null,
        notes: parsed?.notes ? String(parsed.notes) : null,
        file_url: f.url,
        photo_url: isExcel ? null : f.url,
      },
    },
  };
  await saveSession(session);

  const preview = lines
    .map((l, i) => `${i + 1}. ${l.zayavka_id ? "✅" : "⚠️"} ${l.name} — <b>${l.qty}</b>${l.unit ? " " + l.unit : ""}${l.brigade_name ? ` · 👷 ${l.brigade_name}` : ""}`)
    .join("\n");
  const unmatched = lines.filter((l) => !l.zayavka_id).length;
  await send(
    chat_id,
    `📄 <b>Fayldan o'qildi</b> (${lines.length} qator)\n\n${preview}` +
      (unmatched ? `\n\n⚠️ ${unmatched} qator BOQ ga bog'lanmadi — ular faqat hisobotda qoladi.` : "") +
      (parsed?.issues ? `\n\n⚠️ Muammo: ${parsed.issues}` : ""),
    {
      inline_keyboard: [
        [{ text: "✅ Saqlash", callback_data: "dr:impsave" }],
        [{ text: "↩️ Bekor qilish", callback_data: "dr:cancel" }],
      ],
    },
  );
}

async function drSaveImport(session: Session, chat_id: number, message_id?: number) {
  const d = session.data?.dr ?? {};
  const imp = d.import;
  const project_id = d.project_id ?? session.data?.project_id;
  if (!imp?.lines?.length || !project_id) {
    await send(chat_id, "❌ Saqlash uchun ma'lumot topilmadi.", drMenu());
    return;
  }
  const sb = admin();
  const uid = session.telegram_user_id;
  let reporter = "";
  try {
    const { data: p } = await sb.from("profiles").select("full_name").eq("telegram_user_id", uid).maybeSingle();
    reporter = p?.full_name ?? "";
  } catch { /* e'tiborsiz */ }

  const { data: rp, error: rpErr } = await sb
    .from("daily_reports")
    .insert({
      project_id,
      report_date: new Date().toISOString().slice(0, 10),
      telegram_user_id: uid,
      reporter_name: reporter,
      issues: imp.issues ?? null,
      notes: imp.notes ?? null,
      photo_url: imp.photo_url ?? null,
    })
    .select("id")
    .maybeSingle();
  if (rpErr || !rp?.id) { await send(chat_id, `⚠️ Saqlashda xatolik: ${rpErr?.message ?? "no id"}`); return; }

  const rows = (imp.lines as DrImportLine[]).map((l) => ({
    report_id: rp.id,
    zayavka_id: l.zayavka_id,
    activity_name: l.name,
    unit: l.unit,
    qty_done: l.qty,
    brigade_name: l.brigade_name ?? null,
    workers_count: l.workers_count ?? null,
    equipment_name: l.equipment_name ?? null,
    equipment_hours: l.equipment_hours ?? null,
    note: l.note ?? null,
  }));
  const { error: linesErr } = await sb.from("daily_report_lines").insert(rows);
  if (linesErr) { await send(chat_id, `⚠️ Qatorlar saqlanmadi: ${linesErr.message}`); return; }

  await drRecompute(project_id);

  session.flow = "dr";
  session.step = "menu";
  session.data = { ...(session.data ?? {}), dr: {} };
  await saveSession(session);

  const okText = `✅ <b>Hisobot saqlandi</b> — ${rows.length} ta qator kiritildi.`;
  if (message_id) { try { await editText(chat_id, message_id, okText); } catch { await send(chat_id, okText); } }
  else await send(chat_id, okText);
  await send(chat_id, "Yana hisobot berish uchun «➕ Yangi hisobot» tugmasini bosing.", drMenu());
}




// Prorab uchun loyihadagi BOQ aktivitilarini tanlash (inline tugmalar)
async function drShowItems(chat_id: number, project_id: string, message_id?: number) {
  const sb = admin();
  const { data, error } = await sb
    .from("project_zayavka")
    .select("id,name,unit,qty,unit_price,kind,off_plan")
    .eq("project_id", project_id)
    .is("parent_id", null)
    .in("kind", ["work", "ustalar"])
    .order("name", { ascending: true })
    .limit(80);
  if (error) { await send(chat_id, `⚠️ Xatolik: ${error.message}`); return; }
  const items = (data ?? []) as any[];
  if (!items.length) {
    await send(chat_id, "📋 Bu loyihada hisobot uchun BOQ qatorlari yo'q.");
    return;
  }
  const kb = items.map((it) => [
    { text: `${it.kind === "ustalar" ? "👷" : "🔨"} ${it.name}${it.unit ? ` (${it.unit})` : ""}`, callback_data: `dr:pick:${it.id}` },
  ]);
  kb.push([{ text: "↩️ Bekor qilish", callback_data: "dr:cancel" }]);
  const text = `🔨 <b>Ish / Ustalar (BOQ)</b> (${items.length} ta)\nBugun bajarilgan ish turini tanlang:`;
  if (message_id) await editText(chat_id, message_id, text, { inline_keyboard: kb });
  else await send(chat_id, text, { inline_keyboard: kb });
}

// Kunlik hisobotdan hisoblangan bajarilishni qayta hisoblash
async function drRecompute(project_id: string) {
  try {
    const sb = admin();
    const { data: all } = await sb.from("project_zayavka").select("id").eq("project_id", project_id);
    const ids = new Set<string>();
    for (const z of (all ?? []) as any[]) ids.add(z.id as string);
    for (const zid of ids) {
      try { await sb.rpc("recompute_zayavka_progress", { _zid: zid }); } catch { /* tuzatilmaydi */ }
    }
  } catch { /* izolyatsiya */ }
}

// Saqlash
async function drSave(session: Session, chat_id: number, message_id?: number) {
  const d = session.data?.dr ?? {};
  const project_id = d.project_id ?? session.data?.project_id;
  if (!project_id || !d.zayavka_id) {
    await send(chat_id, "❌ Hisobot to'liq emas. Qaytadan boshlang.", drMenu());
    session.flow = "dr"; session.step = "menu";
    await saveSession(session);
    return;
  }
  const sb = admin();
  const uid = session.telegram_user_id;
  let reporter = "";
  try {
    const { data: p } = await sb.from("profiles").select("full_name").eq("telegram_user_id", uid).maybeSingle();
    reporter = p?.full_name ?? "";
  } catch { /* e'tiborsiz */ }
  const { data: rp, error: rpErr } = await sb
    .from("daily_reports")
    .insert({
      project_id,
      report_date: new Date().toISOString().slice(0, 10),
      telegram_user_id: uid,
      reporter_name: reporter,
      issues: d.issues ?? null,
      notes: d.note ?? null,
      photo_url: d.photo_url ?? null,
    })
    .select("id")
    .maybeSingle();
  if (rpErr || !rp?.id) {
    await send(chat_id, `⚠️ Saqlashda xatolik: ${rpErr?.message ?? "no id"}`);
    return;
  }
  const { error: lineErr } = await sb.from("daily_report_lines").insert({
    report_id: rp.id,
    zayavka_id: d.zayavka_id,
    activity_name: d.name ?? "",
    unit: d.unit ?? null,
    qty_done: Number(d.qty) || 0,
    brigade_name: d.brigade_name ?? null,
    workers_count: d.workers_count ? Number(d.workers_count) : null,
    equipment_name: d.equipment_name ?? null,
    equipment_hours: d.equipment_hours ? Number(d.equipment_hours) : null,
    note: d.note ?? null,
  });
  if (lineErr) {
    await send(chat_id, `⚠️ Qator saqlanmadi: ${lineErr.message}`);
    return;
  }
  // Zayavka progressni qayta hisoblash
  try { await sb.rpc("recompute_zayavka_progress", { _zid: d.zayavka_id }); } catch { /* izolyatsiya */ }
  await drRecompute(project_id);

  const out = [
    "✅ <b>Kunlik hisobot saqlandi!</b>",
    `📌 ${d.name ?? ""}${d.unit ? ` (${d.unit})` : ""}`,
    `🔢 Hajm: <b>${Number(d.qty) || 0}</b>${d.unit ? " " + d.unit : ""}`,
  ];
  if (d.brigade_name) out.push(`👥 Brigada: ${d.brigade_name}`);
  if (d.workers_count) out.push(`🧑\u200d🤝\u200d🧑 Ishchilar: ${d.workers_count} ishchi`);
  if (d.equipment_name) out.push(`🚜 Texnika: ${d.equipment_name}${d.equipment_hours ? ` · ${d.equipment_hours} soat` : ""}`);
  if (d.issues) out.push(`⚠️ Muammo: ${d.issues}`);
  if (d.note) out.push(`📝 Izoh: ${d.note}`);
  if (d.photo_url) out.push(`🖼 Rasm ilova qilindi`);

  // Session tozalash
  session.flow = "dr";
  session.step = "menu";
  session.data = { ...(session.data ?? {}), dr: {} };
  await saveSession(session);
  const finalText = out.join("\n");
  if (message_id) {
    try { await editText(chat_id, message_id, finalText); } catch { await send(chat_id, finalText); }
  } else {
    await send(chat_id, finalText);
  }
  await send(chat_id, "Yana hisobot berish uchun «➕ Yangi hisobot» tugmasini bosing.", drMenu());
}

// ================= Kunlik hisobot — inline callback =================
async function drHandleCallback(session: Session, cb: any, data: string): Promise<boolean> {
  const chat_id = cb.message?.chat?.id ?? session.chat_id;
  const message_id = cb.message?.message_id;
  if (data.startsWith("dr:pick:")) {
    const id = data.slice("dr:pick:".length);
    const { data: it } = await admin()
      .from("project_zayavka")
      .select("id,name,unit,qty,unit_price,kind")
      .eq("id", id)
      .maybeSingle();
    if (!it) { await send(chat_id, "❌ Qator topilmadi."); await answerCb(cb.id); return true; }
    session.flow = "dr";
    session.step = "qty";
    session.data = {
      ...(session.data ?? {}),
      dr: { ...(session.data?.dr ?? {}), zayavka_id: it.id, name: it.name, unit: it.unit ?? "", kind: it.kind, _pending: "qty" },
    };
    await saveSession(session);
    if (message_id) await editText(chat_id, message_id, `✅ Tanlandi: <b>${it.name}</b>`);
    await send(
      chat_id,
      `📌 <b>${it.name}</b>\n\n🔢 Bajarilgan hajmni yozing (${it.unit ? it.unit + " " : ""}masalan 25 yoki 12.5):`,
      { inline_keyboard: [[{ text: "↩️ Bekor qilish", callback_data: "dr:cancel" }]] }
    );
    await answerCb(cb.id);
    return true;
  }
  if (data === "dr:skip") {
    session.data = { ...(session.data ?? {}), dr: { ...(session.data?.dr ?? {}), _pending: "none" } };
    await saveSession(session);
    try { await editText(chat_id, message_id, "✅ O'tkazib yuborildi"); } catch { /* eski xabar */ }
    await drShowSummary(session, chat_id);
    await answerCb(cb.id);
    return true;
  }
  if (data === "dr:impsave") {
    try { await editText(chat_id, message_id, "⏳ Saqlanmoqda..."); } catch { /* eski xabar */ }
    await drSaveImport(session, chat_id, message_id);
    await answerCb(cb.id, "Saqlandi");
    return true;
  }
  if (data === "dr:confirm") {
    try { await editText(chat_id, message_id, "⏳ Saqlanmoqda..."); } catch { /* eski xabar */ }
    await drSave(session, chat_id, message_id);
    await answerCb(cb.id, "Saqlandi");
    return true;
  }
  if (data === "dr:cancel") {
    session.flow = "dr";
    session.step = "menu";
    session.data = { ...(session.data ?? {}), dr: {} };
    await saveSession(session);
    try { await editText(chat_id, message_id, "↩️ Bekor qilindi."); } catch { /* eski xabar */ }
    await send(chat_id, "📋 Kunlik hisobot bekor qilindi.", drMenu());
    await answerCb(cb.id);
    return true;
  }
  return false;
}

// Xulosa kartasi
async function drShowSummary(session: Session, chat_id: number) {
  const d = session.data?.dr ?? {};
  const lines = [
    "📋 <b>Hisobot xulosasi:</b>",
    `📌 ${d.name ?? ""}${d.unit ? ` (${d.unit})` : ""}`,
    `🔢 Hajm: <b>${Number(d.qty) || 0}</b>${d.unit ? " " + d.unit : ""}`,
  ];
  if (d.brigade_name) lines.push(`👥 Brigada: ${d.brigade_name}`);
  if (d.workers_count) lines.push(`🧑\u200d🤝\u200d🧑 Ishchilar: ${d.workers_count} ishchi`);
  if (d.equipment_name) lines.push(`🚜 Texnika: ${d.equipment_name}${d.equipment_hours ? ` · ${d.equipment_hours} soat` : ""}`);
  if (d.issues) lines.push(`⚠️ Muammo: ${d.issues}`);
  if (d.note) lines.push(`📝 Izoh: ${d.note}`);
  if (d.photo_url) lines.push(`🖼 Rasm: ✓`);
  lines.push("");
  lines.push("Qo'shimcha ma'lumot qo'shish yoki tasdiqlash:");
  await send(chat_id, lines.join("\n"), {
    inline_keyboard: [
      [{ text: "👥 Brigada/ishchilar", callback_data: "dr:field:brigade" }],
      [{ text: "🚜 Texnika", callback_data: "dr:field:equipment" }],
      [{ text: "⚠️ Muammo", callback_data: "dr:field:issues" }],
      [{ text: "📝 Izoh", callback_data: "dr:field:note" }],
      [{ text: "🖼 Rasm", callback_data: "dr:field:photo" }],
      [{ text: "✅ Tasdiqlash", callback_data: "dr:confirm" }],
      [{ text: "↩️ Bekor qilish", callback_data: "dr:cancel" }],
    ],
  });
}

// Texnika/brigada/muammo — field so'rash
function drHandleField(session: Session, cb: any, field: string): Promise<boolean> {
  const chat_id = cb.message?.chat?.id ?? session.chat_id;
  const message_id = cb.message?.message_id;
  const prompts: Record<string, string> = {
    brigade: "👥 <b>Brigada / ishchilar</b>\n\nBrigada nomi va ishchilar sonini yozing.\nMasalan: «Brigada 1, 8 ishchi»",
    equipment: "🚜 <b>Texnika</b>\n\nIshlatilgan texnika nomi va soatini yozing.\nMasalan: «Ekskavator 6 soat»",
    issues: "⚠️ <b>Muammo</b>\n\nBugungi muammo/qiyinchiliklarni yozing (yoki ↩️ o'tkazib yuboring):",
    note: "📝 <b>Izoh</b>\n\nQo'shimcha izoh yozing (yoki ↩️ o'tkazib yuboring):",
    photo: "🖼 <b>Rasm</b>\n\nIsh joyining rasmini yuboring (yoki ↩️ o'tkazib yuboring):",
  };
  return (async () => {
    session.flow = "dr";
    session.step = `input:${field}`;
    session.data = { ...(session.data ?? {}), dr: { ...(session.data?.dr ?? {}), _pending: field } };
    await saveSession(session);
    if (message_id) await editText(chat_id, message_id, prompts[field] ?? field);
    else await send(chat_id, prompts[field] ?? field);
    await send(chat_id, "Yozing:", {
      inline_keyboard: [[{ text: "↩️ O'tkazib yuborish", callback_data: "dr:skip" }, { text: "↩️ Bekor qilish", callback_data: "dr:cancel" }]],
    });
    await answerCb(cb.id);
    return true;
  })();
}

// Matn kiritish — dr oqimida
async function drHandleText(session: Session, chat_id: number, text: string): Promise<boolean> {
  const d = session.data?.dr ?? {};
  const pending = d._pending ?? null;
  if (!pending || pending === "none") return false;
  let field = pending;
  if (pending === "qty") {
    const v = parseFloat(String(text).replace(",", "."));
    if (!Number.isFinite(v) || v < 0) {
      await send(chat_id, "❌ Iltimos, son kiriting (masalan 25 yoki 12.5):");
      return true;
    }
    d.qty = v;
    d._pending = "none";
    session.flow = "dr";
    session.step = "summary";
    session.data = { ...(session.data ?? {}), dr: d };
    await saveSession(session);
    await drShowSummary(session, chat_id);
    return true;
  }
  if (field === "brigade") {
    const t = String(text).trim();
    const m = t.match(/(\d+)\s*(ishchi|kishi|nafar|odam)/i);
    const name = t.replace(/[,;·]?\s*\d+\s*(ishchi|kishi|nafar|odam)\s*/i, "").trim();
    d.brigade_name = name || (m ? null : t) || null;
    if (m) d.workers_count = parseInt(m[1], 10);
    else if (/^\d+$/.test(t)) { d.workers_count = parseInt(t, 10); d.brigade_name = null; }
  } else if (field === "equipment") {

    const t = String(text).trim();
    const hm = t.match(/([\d.,]+)\s*(soat|h|hr)/i);
    d.equipment_name = t;
    if (hm) d.equipment_hours = parseFloat(hm[1].replace(",", "."));
  } else if (field === "issues") {
    d.issues = text.trim();
  } else if (field === "note") {
    d.note = text.trim();
  } else if (field === "photo") {
    d.note = text.trim();
  }
  d._pending = "none";
  session.flow = "dr";
  session.step = "summary";
  session.data = { ...(session.data ?? {}), dr: d };
  await saveSession(session);
  await send(chat_id, "✅ Qabul qilindi.");
  await drShowSummary(session, chat_id);
  return true;
}


/** Salyarka / DPR / HR kunlik PDF hisobotlari. true qaytarsa — javob yuborildi. */
async function sendSpecialReport(chat_id: number, question: string, date: string): Promise<boolean> {
  const kind = detectReportKind(question);
  if (kind === "cash") return false;
  if (kind === "dpr") {
    const rep = await buildDprDayPdf(date).catch((e) => { console.error("dpr pdf", e); return null; });
    if (!rep) {
      await send(chat_id, "⚠️ DPR jadvalini o'qib bo'lmadi, PDF tayyorlanmadi. Birozdan keyin qayta so'rang.");
      return true;
    }
    const top = rep.byWork.slice(0, 5).map(([w, q, u]) => `• ${w}: <b>${(Math.round(q * 100) / 100).toLocaleString("ru-RU")} ${u}</b>`).join("\n");
    await nkSendPdf(chat_id, rep.bytes, `PV_Olga_DPR_${date}.pdf`,
      `📄 <b>${date} DPR hisoboti</b>\n📝 Yozuvlar: <b>${rep.count}</b>\n${top || "Bu kunda yozuv yo'q."}`);
    return true;
  }
  if (kind === "hr") {
    const rep = await buildHrDayPdf(date).catch((e) => { console.error("hr pdf", e); return null; });
    if (!rep) {
      await send(chat_id, "⚠️ HR jadvalini o'qib bo'lmadi, PDF tayyorlanmadi. Birozdan keyin qayta so'rang.");
      return true;
    }
    await nkSendPdf(chat_id, rep.bytes, `PV_Olga_HR_${date}.pdf`,
      `👥 <b>${date} HR hisoboti</b>\n✅ Ishda: <b>${rep.present}</b>\n❌ Kelmadi: <b>${rep.absent}</b>\n🆕 Ishga qabul: <b>${rep.hired}</b>\n🚪 Ishdan chiqdi: <b>${rep.left}</b>`);
    return true;
  }
  const rep = await buildFuelDayPdf(date).catch((e) => { console.error("fuel pdf", e); return null; });
  if (!rep) {
    await send(chat_id, "⚠️ Salyarka jadvalini o'qib bo'lmadi, PDF tayyorlanmadi. Birozdan keyin qayta so'rang.");
    return true;
  }
  const f = (n: number) => (Math.round(n * 10) / 10).toLocaleString("ru-RU").replace(/[\s\u00a0\u202f]/g, " ");
  await nkSendPdf(chat_id, rep.bytes, `PV_Olga_salyarka_${date}.pdf`,
    `⛽ <b>${date} salyarka hisoboti</b>\n📥 Kirim: <b>${f(rep.inLit)} l</b>\n📤 Sarf: <b>${f(rep.outLit)} l</b>\n🛢 Kun oxiri qoldiq: <b>${f(rep.stock)} l</b>`);
  return true;
}
