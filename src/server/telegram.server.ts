// Telegram bot — sodda AI yordamchi.
// Foydalanuvchi kun davomida xarajat/material/zayavka yozadi (matn/ovoz/rasm) →
// AI har birini avtomatik kategoriyaga ajratadi → DRAFT ga qo'shiladi →
// Foydalanuvchi "✅ Tasdiqlash" tugmasini bosgach hammasi DB ga yoziladi.
import { createClient } from "@supabase/supabase-js";
import {
  tryStartJoinRequest,
  tryHandleJoinFlow,
  tryHandleAdminCommand,
  tryHandleCallback as tryHandleUserAdminCallback,
} from "@/server/telegram-user-admin";

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TG_API = `https://api.telegram.org/bot${TG_TOKEN}`;
const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY!;

function admin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

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

// ---------- Aisha TTS (o'zbek tilida ovozli javob) ----------
async function aishaTts(text: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.AISHA_API_KEY;
  if (!apiKey) {
    console.warn("[aisha] AISHA_API_KEY yo'q");
    return null;
  }
  const clean = text
    .replace(/<[^>]+>/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#>`|]/g, " ")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[⚠️✅❌🔴🟠🟢🚨⚡️🎧📝🤔🔇]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
  if (!clean) {
    console.warn("[aisha] bo'sh matn");
    return null;
  }
  try {
    const form = new FormData();
    form.append("transcript", clean);
    form.append("language", "uz");
    form.append("model", "Gulnoza");
    form.append("mood", "Neutral");
    form.append("speed", "1.0");
    const res = await fetch("https://back.aisha.group/api/v1/tts/post/", {
      method: "POST",
      headers: { "X-Api-Key": apiKey, "Accept-Language": "uz" },
      body: form,
    });
    if (!res.ok) {
      console.warn("[aisha] tts failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("application/json")) {
      return await res.arrayBuffer();
    }
    const j = (await res.json().catch(() => null)) as { audio_path?: string } | null;
    if (!j?.audio_path) {
      console.warn("[aisha] audio_path yo'q", JSON.stringify(j));
      return null;
    }
    const url = j.audio_path.startsWith("http")
      ? j.audio_path
      : `https://back.aisha.group${j.audio_path}`;
    const audioRes = await fetch(url, { headers: { "X-Api-Key": apiKey } });
    if (!audioRes.ok) {
      console.warn("[aisha] audio fetch failed", audioRes.status);
      return null;
    }
    return await audioRes.arrayBuffer();
  } catch (e) {
    console.warn("[aisha] tts exception", e);
    return null;
  }
}

async function sendVoice(chat_id: number, audio: ArrayBuffer, caption?: string): Promise<boolean> {
  // Avval Telegramning haqiqiy voice bubble (sendVoice) sifatida yuborishga urinamiz.
  // Aisha WAV qaytaradi — Telegram sendVoice rasman OGG/OPUS kutadi, lekin ko'p hollarda WAV ham qabul qilinadi.
  // Muvaffaqiyatsiz bo'lsa — sendAudio (play tugmasi bilan audio fayl) ga o'tamiz.
  const tryEndpoint = async (endpoint: "sendVoice" | "sendAudio"): Promise<boolean> => {
    const form = new FormData();
    form.append("chat_id", String(chat_id));
    if (caption) {
      form.append("caption", caption.slice(0, 1000));
      form.append("parse_mode", "HTML");
    }
    const field = endpoint === "sendVoice" ? "voice" : "audio";
    const filename = endpoint === "sendVoice" ? "aisha.ogg" : "aisha.wav";
    form.append(field, new Blob([audio], { type: "audio/ogg" }), filename);
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
const AI_ROLES = ["admin", "pm", "direktor"] as const;
const aiAllowedByChat = new Map<number, boolean>();

async function checkAiAccess(uid: number): Promise<boolean> {
  try {
    const { data: prof } = await admin()
      .from("profiles").select("id").eq("telegram_user_id", uid).maybeSingle();
    if (!prof?.id) return false;
    const { data } = await admin()
      .from("user_roles").select("role").eq("user_id", prof.id).in("role", AI_ROLES as any);
    return (data ?? []).length > 0;
  } catch { return false; }
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

// Diqqat tortuvchi emoji — har safar yangilanganida almashadi (o'chib-yonish effekti)
const BLINK_EMOJI = ["🔴", "🟠", "🚨", "⚡️"];
function blinkEmoji() {
  return BLINK_EMOJI[Math.floor(Date.now() / 1000) % BLINK_EMOJI.length];
}

function mainMenu(draftCount = 0, chatId?: number) {
  const pname = chatId ? projectNameByChat.get(chatId) : undefined;
  const headerRow = pname
    ? [{ text: `🏗 ${pname} /Loyihalar` }]
    : [{ text: `${blinkEmoji()} LOYIHANI TANLANG! /Loyihalar` }];
  return {
    keyboard: [
      headerRow,
      [
        { text: `📒 Daftar (${draftCount})` },
        { text: "📍 Davomat (lokatsiya)", request_location: true },
      ],
      [
        { text: "📋 Smeta" }, { text: "💼 Buxgalteriya" },
      ],
    ],
    resize_keyboard: true,
  };
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
async function askAgent(history: { role: "user" | "assistant"; content: string }[], project_id: string | null, client?: "voice" | "mobile" | "web"): Promise<string> {
  try {
    const url = `${process.env.SUPABASE_URL}/functions/v1/ai-agent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ messages: history, project_id, client: client ?? "mobile" }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return `⚠️ ${j?.error ?? "AI xato"}`;
    return (j?.reply ?? "").toString().trim() || "🤔 Javob bo'sh.";
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
  const { data } = await sb.from("telegram_sessions").select("*").eq("chat_id", chat_id).maybeSingle();
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
async function uploadFile(file_id: string, prefix: string): Promise<{ url: string; bytes: Uint8Array; mime: string } | null> {
  try {
    const r = await fetch(`${TG_API}/getFile?file_id=${file_id}`).then((x) => x.json());
    const path = r?.result?.file_path;
    if (!path) return null;
    const fileRes = await fetch(`https://api.telegram.org/file/bot${TG_TOKEN}/${path}`);
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    const ext = path.split(".").pop() || "bin";
    const mime = fileRes.headers.get("content-type") || "application/octet-stream";
    const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const sb = admin();
    const { error } = await sb.storage.from("telegram-files").upload(key, buf, { contentType: mime });
    if (error) return null;
    const url = sb.storage.from("telegram-files").getPublicUrl(key).data.publicUrl;
    return { url, bytes: buf, mime };
  } catch {
    return null;
  }
}

// ---------- Lovable AI ----------
async function callAi(systemPrompt: string, userParts: any[], model = "google/gemini-2.5-flash"): Promise<any | null> {
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
      console.error("AI error", res.status, await res.text());
      return null;
    }
    const j = await res.json();
    const txt: string = j?.choices?.[0]?.message?.content ?? "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch (e) {
    console.error("ai parse", e);
    return null;
  }
}

async function transcribeAudio(bytes: Uint8Array, mime: string): Promise<string | null> {
  try {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Audio dan o'zbek tilida matnga aylantir. Faqat matnni qaytar." },
          {
            role: "user",
            content: [
              { type: "text", text: "Quyidagi audioni transkripsiya qil:" },
              { type: "input_audio", input_audio: { data: b64, format: mime.includes("ogg") ? "ogg" : "mp3" } } as any,
            ],
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

// ---------- AI prompt ----------
function autoPrompt(materials: any[], works: any[], categories: string[]) {
  const ml = materials.slice(0, 200).map((c: any) => `${c.id}|${c.name} (${c.unit})`).join("\n");
  const wl = works.slice(0, 200).map((c: any) => `${c.id}|${c.name} (${c.unit})`).join("\n");
  const catList = categories.length ? categories.join("|") : "Boshqa";
  return `Sen qurilish loyihasi yordamchi AI sisan. Foydalanuvchi xabarini (matn/ovoz/rasm) o'qib HAR BIR yozuvni KATEGORIYAga ajratib JSON qaytar.

FAQAT 4 KATEGORIYA (kind):
- "zayavka" — material/ish so'rov: "menga 50 qop sement kerak", "armatura olishimiz kerak".
- "material" — material AYNI PAYTDA omborga keldi/qabul qilindi: "5 qop sement keldi 65000 dan".
- "expense" — pul XARAJATI (chiqim): "yo'l puli berdim", "benzin 200ming", "ovqat 50ming".
- "income" — KIRIM PUL (kassaga pul keldi). MUHIM: "kirim", "pul oldim", "pul keldi", "prixod", "приход", "kassaga tushdi", "tushdi", "to'lov keldi", "investitsiya keldi", "avans oldik", "mijoz to'ladi" — bularning hammasi income. Bu xarajat EMAS, bu kirim.

QOIDALAR:
- Bitta xabarda har xil yozuvlar bo'lishi mumkin — har birini alohida item qil.
- Material/zayavka uchun katalogdan eng mos master_id ni TOPISHGA HARAKAT QIL. Mos kelmasa null va off_plan: true.
- Expense uchun category FAQAT quyidagi ro'yxatdan tanla: ${catList}. Hech qaysi mos kelmasa "Boshqa".
- Income uchun payment_method: "bank/karta/plastik/o'tkazma/перевод" → "Bank"; aks holda "Naqd".
- TIL: matn o'zbek (lotin/kirill), rus, ingliz tillarida bo'lishi mumkin. Tarjima qil: "excavation"="kovlash", "concrete"="beton", "rebar"="armatura", "brick"="g'isht", "cement"="sement", "sand"="qum", "gravel"="shag'al", "plaster"="shtukaturka", "paint"="bo'yoq", "tile"="plitka", "transport"="transport", "labor"="ish haqi". Imlo xatolari va qisqartmalarni tushun.
- AGAR matn QURILISH ISHI yoki MATERIALga o'xshasa (masalan: "kovlash 100 m3", "excavation 20m3", "beton quyish 5m3") — ALBATTA "zayavka" sifatida qaytar (z_kind="work" ish uchun, "material" material uchun), name=ish/material nomi (o'zbekchaga tarjima qil), qty va unit ni matndan oling. HECH QACHON bo'sh items qaytarmang agar matnda biror raqam va so'z bo'lsa.
- AGAR umuman tushunmasangiz HAM, eng yaqin "expense" item qaytaring (description=matnning o'zi, amount=0).

Master material katalog (id|nom (birlik)):
${ml || "(yo'q)"}

Master ish katalog (id|nom (birlik)):
${wl || "(yo'q)"}

Faqat JSON:
{"items":[
  {"kind":"zayavka","z_kind":"material|work","master_id":null,"master_name":null,"off_plan":false,"name":"...","qty":0,"unit":"...","unit_price":0,"notes":null},
  {"kind":"material","master_id":null,"master_name":null,"off_plan":false,"name":"...","qty":0,"unit":"...","unit_price":0,"supplier":null},
  {"kind":"expense","category":"${catList}","amount":0,"payment_method":"Naqd|Plastik|O'tkazma|Hisob","description":"...","paid_by":null},
  {"kind":"income","amount":0,"payment_method":"Naqd|Bank","description":"...","payer":null}
]}`;
}

// ---------- Render ----------
function fmtMoney(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("uz-UZ") : "—";
}
function parseMoney(text: string): number {
  const m = text.toLowerCase().match(/(\d[\d\s.,'`]*\d|\d)\s*(mlrd|milliard|миллиард|billion|bln|mln|million|млн|ming|минг|k|000)?/i);
  if (!m) return 0;
  let numStr = m[1].replace(/[\s'`]/g, "");
  const hasComma = numStr.includes(",");
  const hasDot = numStr.includes(".");
  if (hasComma && hasDot) {
    const lastComma = numStr.lastIndexOf(",");
    const lastDot = numStr.lastIndexOf(".");
    numStr = lastComma > lastDot
      ? numStr.replace(/\./g, "").replace(",", ".")
      : numStr.replace(/,/g, "");
  } else if (hasComma) {
    const parts = numStr.split(",");
    numStr = parts.length > 2 || (parts.length === 2 && parts[1].length === 3)
      ? numStr.replace(/,/g, "")
      : numStr.replace(",", ".");
  } else if (hasDot) {
    const parts = numStr.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      numStr = numStr.replace(/\./g, "");
    }
  }
  const n = Number(numStr);
  if (!Number.isFinite(n)) return 0;
  const unit = (m[2] ?? "").toLowerCase();
  if (["mlrd", "milliard", "миллиард", "billion", "bln"].includes(unit)) return n * 1_000_000_000;
  if (["mln", "million", "млн"].includes(unit)) return n * 1_000_000;
  if (["ming", "минг", "k"].includes(unit)) return n * 1_000;
  return n;
}
function isIncomeText(text: string) {
  return /\b(kirim|prixod|prexod|приход|pul\s*old|пул\s*олд|pul\s*keldi|kassaga|to'?lov\s*keldi|investitsiya|avans\s*old|mijoz\s*to'?la)/i.test(text);
}
function payMethod(text: string) {
  return /\b(bank|plastik|karta|o'?tkazma|hisob|перевод|карта)/i.test(text) ? "Bank" : "Naqd";
}
const KIND_BADGE: Record<string, string> = {
  zayavka: "📝 Zayavka",
  material: "📦 Ombor",
  expense: "💰 Xarajat",
  income: "🟢 Kirim",
};
function renderItem(it: any, idx: number): string {
  const kind = it.kind ?? "expense";
  const badge = `<b>${idx}.</b> ${KIND_BADGE[kind] ?? kind}`;
  if (kind === "material") {
    const total = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
    return `${badge} — ${it.name ?? "?"} ${it.qty ?? "?"} ${it.unit ?? ""} × ${fmtMoney(it.unit_price)} = <b>${fmtMoney(total)}</b>`;
  }
  if (kind === "zayavka") {
    const zk = it.z_kind === "work" ? "🔨" : "📦";
    return `${badge} ${zk} ${it.name ?? "?"} — ${it.qty ?? "?"} ${it.unit ?? ""}`;
  }
  if (kind === "income") {
    const amount = Math.max(Number(it.amount) || 0, parseMoney(`${it.description ?? ""} ${it._source_note ?? ""}`));
    return `${badge} — ${fmtMoney(amount)} so'm (${it.payment_method ?? "Naqd"})${it.description ? ` — ${it.description}` : ""}`;
  }
  return `${badge} — ${it.category ?? "?"}: ${fmtMoney(it.amount)} so'm${it.description ? ` (${it.description})` : ""}`;
}
const renderItems = (items: any[]) => items.map((it, i) => renderItem(it, i + 1)).join("\n");

// ---------- Saqlash ----------
async function persistDraft(session: Session): Promise<string> {
  const items: any[] = getDraft(session);
  const project_id = session.data?.project_id;
  if (!project_id) return "❌ Loyiha tanlanmagan.";
  if (!items.length) return "❌ Draft bo'sh.";
  const sb = admin();
  let ok = 0;
  const errs: string[] = [];

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
        category: _isContract ? "Shartnoma" : "Kirim",
        description: it.description ?? null,
        amount,
        payment_method: payMethod(`${it.payment_method ?? ""} ${it.description ?? ""} ${it._source_note ?? ""}`),
        payer: it.payer ?? it.paid_by ?? null,
        telegram_user_id: session.telegram_user_id,
        source: src,
        source_note: srcNote,
      }));
    } else {
      ({ error: err } = await sb.from("expenses").insert({
        project_id,
        category: it.category ?? "Boshqa",
        description: it.description ?? null,
        amount: Number(it.amount) || 0,
        payment_method: it.payment_method ?? "Naqd",
        paid_by: it.paid_by ?? null,
        telegram_user_id: session.telegram_user_id,
        source: src,
        source_note: srcNote,
      }));
    }
    if (err) errs.push(err.message);
    else ok++;
  }
  // Clear draft
  session.data = { ...session.data, draft: [] };
  await saveSession(session);
  return `✅ <b>${ok}</b> ta yozuv Umumiy jadvalga saqlandi${errs.length ? `\n⚠️ Xato: ${errs.length} (${errs[0]})` : ""}`;
}

// ---------- Loyiha tanlash ----------
async function showFirmPicker(chat_id: number) {
  // Firmalar tanlovi olib tashlandi — to'g'ridan-to'g'ri loyiha tanlanadi
  await showProjectPicker(chat_id, null);
}

async function showProjectPicker(chat_id: number, firm_id: string | null) {
  let q = admin().from("projects").select("id,name,code,firm_id").eq("status", "active");
  if (firm_id) q = q.eq("firm_id", firm_id);
  const { data } = await q.order("created_at", { ascending: false }).limit(30);
  const projects = data ?? [];
  if (!projects.length) {
    await send(chat_id, "❌ Faol loyiha yo'q.", mainMenu(0, chat_id));
    return;
  }
  // Reply keyboard sifatida — pastdagi menyu o'rniga loyihalar ro'yxati chiqadi
  const map = new Map<string, string>();
  const rows: { text: string }[][] = [];
  for (const p of projects as any[]) {
    const label = `🏗 ${p.name}${p.code ? ` (${p.code})` : ""}`;
    map.set(label, p.id);
    rows.push([{ text: label }]);
  }
  rows.push([{ text: "↩️ Bekor" }]);
  projectPickByChat.set(chat_id, map);
  // Sessiyaga flag yozish — text handlerda ushlash uchun
  const s = await getSession(chat_id, 0, null);
  s.flow = "pick_project";
  await saveSession(s);
  await send(chat_id, "🏗 <b>Loyihani tanlang:</b>", { keyboard: rows, resize_keyboard: true });
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
  const sb = admin();
  const [mats, works, catsRes] = await Promise.all([
    loadMaster("material"),
    loadMaster("work"),
    sb.from("expense_categories").select("name").order("name"),
  ]);
  const cats = (catsRes.data ?? []).map((c: any) => c.name).filter(Boolean);
  return autoPrompt(mats, works, cats);
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
  const parsed = await callAi(prompt, parts, imageUrl ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash");
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
  return items;
}


async function addToDraft(session: Session, newItems: any[], sourceMeta: { source: string; note: string }) {
  if (!newItems.length) {
    await send(session.chat_id, "⚠️ Tushuna olmadim. Aniqroq yozing.", mainMenu(getDraft(session).length, session.chat_id));
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
    confirmMsg = `✅ Qo'shildi (${draft.length})`;
    session.data = { ...session.data, draft };
  }
  await saveSession(session);
  await send(session.chat_id, confirmMsg, mainMenu(draft.length, session.chat_id));
}

async function showDaftar(session: Session, replaceMessageId?: number, mode: "view" | "edit" | "del" = "view") {
  const draft = getDraft(session);
  const chat_id = session.chat_id;
  if (!draft.length) {
    const text = "📒 <b>Daftar bo'sh.</b>\nXarajat/material yozing yoki ovoz/rasm yuboring.";
    if (replaceMessageId) await editText(chat_id, replaceMessageId, text);
    else await send(chat_id, text, mainMenu(0, chat_id));
    return;
  }
  const lines = draft.map((it, i) => renderItem(it, i + 1));
  const buttons: any[] = [];
  if (mode === "view") {
    buttons.push([
      { text: "✏️ Tahrirlash", callback_data: "daftar:pick:edit" },
      { text: "🗑 O'chirish", callback_data: "daftar:pick:del" },
    ]);
    buttons.push([
      { text: "✅ Hammasini tasdiqlash", callback_data: "draft:confirm" },
      { text: "🗑 Tozalash", callback_data: "draft:clear" },
    ]);
  } else {
    // Pick a row: show 1..N as a grid (max 4 per row)
    const cb = mode === "edit" ? "item:edit:" : "item:del:";
    let row: any[] = [];
    for (let i = 0; i < draft.length; i++) {
      row.push({ text: `${mode === "edit" ? "✏️" : "🗑"} ${i + 1}`, callback_data: `${cb}${i}` });
      if (row.length === 4) { buttons.push(row); row = []; }
    }
    if (row.length) buttons.push(row);
    buttons.push([{ text: "↩️ Orqaga", callback_data: "daftar:view" }]);
  }
  const hint = mode === "view"
    ? "<i>Tahrirlash yoki o'chirish uchun tugmani bosing.</i>"
    : mode === "edit"
      ? "<i>Tahrirlanadigan yozuv raqamini tanlang.</i>"
      : "<i>O'chiriladigan yozuv raqamini tanlang.</i>";
  const body = `📒 <b>Daftar (${draft.length} ta yozuv):</b>\n\n${lines.join("\n")}\n\n${hint}`;
  if (replaceMessageId) await editText(chat_id, replaceMessageId, body, { inline_keyboard: buttons });
  else await send(chat_id, body, { inline_keyboard: buttons });
}
const showDraft = showDaftar;

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

function bzGetState(s: Session) {
  const st = s.data?.bz ?? { step: null, project_id: null, project_name: null, date: null, items: [], cur: {} };
  return st;
}
function bzSetState(s: Session, st: any) {
  s.data = { ...(s.data ?? {}), bz: st };
}

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

function shGet(s: Session): ShState {
  return s.data?.sh ?? { step: "supplier", supplier: null, contract_no: null, contract_date: null, amount: null, note: null, file_url: null };
}
function shSet(s: Session, st: ShState) { s.data = { ...(s.data ?? {}), sh: st }; }

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

function nkGetState(s: Session) {
  return s.data?.nk ?? { step: null, project_id: null, project_name: null, date: null, supplier: null, nakladnoy_no: null, photo_url: null, photo_mime: null, items: [], cur: {} };
}
function nkSetState(s: Session, st: any) {
  s.data = { ...(s.data ?? {}), nk: st };
}

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

async function aiParseNakladnoyItems(text: string): Promise<any[]> {
  return (await aiParseNakladnoy(text)).items;
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
    } catch {}
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
  } catch {}

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
  await getSession(chat_id, uid, username);
  await send(chat_id, `✅ <b>Profil ulandi</b>\n👤 ${prof.full_name ?? "—"}`, mainMenu(0, chat_id));
  await showFirmPicker(chat_id);
  return true;
}

export async function handleUpdate(update: any) {
  if (update.callback_query) return handleCallback(update.callback_query);

  const msg = update.message;
  if (!msg) return;
  const chat_id = msg.chat.id;
  const uid = msg.from?.id ?? chat_id;
  const username = msg.from?.username ?? msg.from?.first_name ?? null;
  const text: string = (msg.text ?? "").trim();

  // ===== Tizimga kirish so'rovi (har kim uchun) — contactdan oldin =====
  if (await tryStartJoinRequest(chat_id, uid, username, text)) return;
  if (await tryHandleJoinFlow(chat_id, uid, username, msg)) return;

  if (msg.contact?.phone_number) {
    if (await linkProfileByContact(chat_id, uid, username, msg.contact)) return;
  }

  // 🔒 Faqat admin tomonidan Telegram ID si kiritilgan foydalanuvchilar
  if (!(await isAllowedTgUser(uid))) {
    await send(
      chat_id,
      `<b>👋 Salom!</b>\n\nTizimga kirish uchun\n\n1️⃣ <b>/sorov</b> buyrug'ini yuboring — administrator tasdiqlaganidan keyin sizga PIN-kod beriladi.`
    );
    return;
  }


  // ===== Admin buyruqlari =====
  if (await tryHandleAdminCommand(chat_id, uid, text)) return;

  const session = await getSession(chat_id, uid, username);
  // AI ruxsatini cache'ga olamiz (admin/PM/CEO uchun)
  aiAllowedByChat.set(chat_id, await checkAiAccess(uid));

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
      `<b>👋 Salom, ${linked.full_name ?? "—"}!</b>\n\nIshni boshlash uchun loyihani tanlang.`,
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
    "📋 Smeta", "💼 Buxgalteriya",
    "📦 Materiallar", "🔨 Ish turlari", "➕ Qo'shimcha (rejadan tashqari)",
    "🚚 Nakladnoy", "🚚 Noklodnoy", "📝 Buyurtma", "📝 Buyurtma (zayavka)", "📝 Zayavka",
    "📄 Shartnoma", "🧾 Faktura", "💸 To'lov so'rash",
  ];

  if (!session.data?.project_id && sectionTexts.includes(text)) {
    await send(
      chat_id,
      `${blinkEmoji()} <b>AVVAL LOYIHANI TANLANG!</b>\n\nIshni boshlash uchun pastdagi ro'yxatdan loyihani tanlang 👇`,
    );
    await showProjectPicker(chat_id, null);
    return;
  }

  // ===== Menyu navigatsiyasi =====
  if (text === "📋 Smeta") {
    await send(chat_id, "📋 <b>Smeta (B.O.Q):</b>\nQaysi bo'limni ko'rmoqchisiz?", smetaMenu());
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

  if (text === "📒 Daftar" || text.startsWith("📒 Daftar") || text === "/daftar" || text === "📋 Draft" || text.startsWith("📋 Draft") || text === "/draft") {
    await showDaftar(session);
    return;
  }

  if (text === "✅ Tasdiqlash" || text === "/tasdiq") {
    if (!getDraft(session).length) {
      await send(chat_id, "📒 Daftar bo'sh — hech narsa saqlanmadi.", mainMenu(0, chat_id));
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
  if (text === "/ai") {
    if (aiAllowedByChat.get(chat_id) !== true) {
      await send(chat_id, "⛔ Bu bo'lim faqat <b>Admin</b>, <b>PM</b> va <b>CEO (Direktor)</b> uchun.", mainMenu(getDraft(session).length, chat_id));
      return;
    }
    session.flow = "ai_chat";
    session.data = { ...session.data, chat_history: [] };
    await saveSession(session);
    const pname = session.data?.project_name ?? "loyiha tanlanmagan";
    await send(
      chat_id,
      `💬 <b>AI yordamchi</b>\n\n🏗 ${pname}\n\nIstalgan savol bering — loyiha holati, moliya, ombor, brigadalar, xodimlar, shartnomalar, hisobotlar yoki umumiy maslahat. Matn yoki ovoz qabul qilaman.`,
      chatMenu()
    );
    return;
  }


  if (session.flow === "ai_chat") {
    if (aiAllowedByChat.get(chat_id) !== true) {
      session.flow = null;
      await saveSession(session);
      await send(chat_id, "⛔ AI yordamchiga ruxsat yo'q.", mainMenu(getDraft(session).length, chat_id));
      return;
    }
    if (text === "⬅️ Orqaga" || text === "🚪 Chatdan chiqish" || text === "/chiqish" || text === "🧹 Suhbatni tozalash") {
      session.flow = null;
      session.data = { ...session.data, chat_history: [] };
      await saveSession(session);
      await send(chat_id, "⬅️ Asosiy menyuga qaytdingiz.", mainMenu(getDraft(session).length, session.chat_id));
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
      await send(chat_id, "📝 Savolni matn yoki ovoz orqali yuboring.", chatMenu());
      return;
    }

    const history: { role: "user" | "assistant"; content: string }[] = Array.isArray(session.data?.chat_history) ? session.data.chat_history : [];
    history.push({ role: "user", content: question });
    await tg("sendChatAction", { chat_id, action: isVoiceInput ? "record_voice" : "typing" });
    const reply = await askAgent(history, session.data?.project_id ?? null, isVoiceInput ? "voice" : "mobile");
    history.push({ role: "assistant", content: reply });
    session.data = { ...session.data, chat_history: history.slice(-12) };
    await saveSession(session);
    if (isVoiceInput) {
      if (reply.startsWith("⚠️")) {
        await send(chat_id, mdToHtml(reply).slice(0, 3800), chatMenu());
      } else {
        const audio = await aishaTts(reply);
        const ok = audio ? await sendVoice(chat_id, audio) : false;
        if (!ok) {
          await send(chat_id, "🔇 Ovozli javob yuborib bo'lmadi (TTS xatosi). Matn bilan beraman:", chatMenu());
          await send(chat_id, mdToHtml(reply).slice(0, 3800), chatMenu());
        }
      }
    } else {
      await send(chat_id, mdToHtml(reply).slice(0, 3800), chatMenu());
    }
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
    const items = await aiParse(cap || null, f.url);
    await addToDraft(session, items, {
      source: "telegram_photo",
      note: `🖼 Rasm${cap ? ` — "${cap.slice(0, 200)}"` : ""}`,
    });
    return;
  }

  // Matn
  if (text) {
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
