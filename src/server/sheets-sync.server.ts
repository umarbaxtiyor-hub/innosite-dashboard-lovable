// «PV Olg'a naqd hisobot» Google Sheets jadvaliga avtomatik yozish.
// Navbat (public.sheet_sync_queue) triggerlar orqali to'ladi; bu yerda
// navbatdagi yozuvlar Master_Data varag'ining oxiriga qator qilib qo'shiladi.
import { createClient } from "@supabase/supabase-js";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

function fmtDate(d?: string | null): string {
  if (!d) return "";
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return String(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

const num = (v: unknown): number | string => (v === null || v === undefined || v === "" ? "" : Number(v));

import { buildCategoryIndex, resolveSheetCategory, type CategoryIndex } from "@/lib/sheet-category";

async function loadCategoryIndex(db: any): Promise<CategoryIndex> {
  const { data, error } = await db.from("sheet_category_map").select("kind,source_category,sheet_category,active");
  if (error) console.error("[sheets-sync] category map:", error.message);
  return buildCategoryIndex((data ?? []) as any[]);
}

export type SheetSyncResult = {
  pending: number;
  appended: number;
  skipped: number;
  errors: string[];
};

function sb() {
  return createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
    auth: { persistSession: false },
  });
}

function gwHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY sozlanmagan");
  if (!sheetsKey) throw new Error("GOOGLE_SHEETS_API_KEY sozlanmagan (Google Sheets ulanmagan)");
  return { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sheetsKey, "Content-Type": "application/json" };
}


/** Varaq mavjudligini ta'minlaydi; yo'q bo'lsa yaratadi va sarlavha yozadi. */
async function ensureTab(spreadsheetId: string, tab: string, header?: string[]) {
  const headers = gwHeaders();
  const meta = await fetch(`${GATEWAY}/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, { headers });
  if (!meta.ok) throw new Error(`Google Sheets [${meta.status}]: ${(await meta.text()).slice(0, 400)}`);
  const titles = (((await meta.json()).sheets ?? []) as any[]).map((s) => s.properties?.title);
  if (titles.includes(tab)) return;
  const add = await fetch(`${GATEWAY}/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST", headers, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
  });
  if (!add.ok) throw new Error(`Google Sheets [${add.status}]: ${(await add.text()).slice(0, 400)}`);
  if (header) {
    await fetch(`${GATEWAY}/spreadsheets/${spreadsheetId}/values/'${tab}'!A1:${String.fromCharCode(64 + header.length)}1?valueInputOption=RAW`, {
      method: "PUT", headers, body: JSON.stringify({ values: [header] }),
    });
  }
}

/** Keyingi bo'sh qatordan boshlab yozadi. width: 8 (A:H loyiha) yoki 9 (A:I bosh jadval). */
async function appendRows(spreadsheetId: string, tab: string, rows: (string | number)[][], width = 8) {
  const headers = gwHeaders();
  const t = /^[A-Za-z0-9_]+$/.test(tab) ? tab : `'${tab}'`;
  const colRes = await fetch(`${GATEWAY}/spreadsheets/${spreadsheetId}/values/${t}!A:A`, { headers });
  if (!colRes.ok) throw new Error(`Google Sheets [${colRes.status}]: ${(await colRes.text()).slice(0, 400)}`);
  const col = ((await colRes.json()).values ?? []) as unknown[][];
  let lastFilled = 0;
  col.forEach((r, i) => { if (r?.[0] !== undefined && String(r[0]) !== "") lastFilled = i + 1; });
  const start = Math.max(2, lastFilled + 1);
  const values = rows.map((r) => r.slice(0, width));
  const end = start + values.length - 1;
  const lastCol = String.fromCharCode(64 + width);
  const res = await fetch(
    `${GATEWAY}/spreadsheets/${spreadsheetId}/values/${t}!A${start}:${lastCol}${end}?valueInputOption=USER_ENTERED`,
    { method: "PUT", headers, body: JSON.stringify({ values }) },
  );
  if (!res.ok) throw new Error(`Google Sheets [${res.status}]: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

// ===================== Idempotent (takrorsiz) yozish =====================
// Har manba yozuvi (expenses/incomes + id) har nishonga (spreadsheet + tab) faqat
// bir marta yoziladi:
//  1) public.sheet_sync_ledger da (source, record, spreadsheet, tab) UNIQUE qatori
//     "writing" holatida yangi write_token bilan band qilinadi — parallel ishchilardan
//     faqat bittasi band qila oladi.
//  2) Qatorlar Google Sheets'ga BITTA atomik batchUpdate bilan yoziladi: pasteData
//     (USER_ENTERED kabi o'qiladi, format saqlanadi) + birinchi qatorga yashirin
//     developer metadata (kalit SYNC_META_KEY, qiymat write_token). Google batchUpdate
//     atomik: yo ikkalasi, yo hech biri qo'llanadi. Jadval ko'rinishi o'zgarmaydi.
//  3) Muvaffaqiyatdan so'ng ledger "written" qilinadi, keyin metama'lumot o'chiriladi
//     (Google'ning 30 000 belgilik metama'lumot limitini to'ldirmaslik uchun).
// Agar 2) dan keyin ishchi qulasa/timeout bo'lsa, ledger "writing" qoladi. SYNC_STALE_MS
// o'tgach keyingi ishchi tokenni Sheet metama'lumotidan qidiradi: topilsa — yozilgan
// ("written"), topilmasa — atomik yozuv qo'llanmagan, demak qayta yozish xavfsiz
// (token CAS bilan almashtiriladi, shuning uchun faqat bitta ishchi qayta yozadi).
const SYNC_META_KEY = "innosite_sync";
const SYNC_STALE_MS = 10 * 60_000;

type LedgerItem = { qid: string; source_table: "expenses" | "incomes" | "fuel" | "hr" | "dpr"; record_id: string; row: (string | number)[] };

/** Telegram xabar kaliti (chat:message_id) dan barqaror UUID — retry'da bir xil chiqadi. */
async function stableUuid(key: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/**
 * Bot yozuvlari (salyarka/HR/DPR) uchun takrorsiz yozish. dedupKey berilsa kassa sync'dagi
 * ledger + token mexanizmi ishlatiladi; berilmasa avvalgidek oddiy append.
 */
async function appendBotRows(kind: "fuel" | "hr" | "dpr", t: { id: string; tab: string }, rows: (string | number)[][], width: number, dedupKey?: string): Promise<number> {
  if (!dedupKey) { await appendRows(t.id, t.tab, rows, width); return rows.length; }
  // Kanonik oqim: avval DB (bot_sheet_outbox), keyin Sheets (ledger orqali takrorsiz).
  // Sheets xato bersa yozuv yo'qolmaydi — soatlik flushBotOutbox qayta urinadi.
  const db = sb();
  const id = await stableUuid(`outbox:${kind}:${dedupKey}`);
  const { error: oErr } = await db.from("bot_sheet_outbox").upsert(
    { id, kind, dedup_key: dedupKey, spreadsheet_id: t.id, tab: t.tab, width, rows },
    { onConflict: "id", ignoreDuplicates: true });
  if (oErr) console.error(`[sheets] outbox ${kind} ${dedupKey}:`, oErr.message);
  try {
    await writeOutboxRows(db, kind, t, rows, width, dedupKey);
    if (!oErr) await db.from("bot_sheet_outbox").update({ status: "written", written_at: new Date().toISOString(), error: null }).eq("id", id);
  } catch (e: any) {
    if (oErr) throw e; // DB ga ham yozilmagan bo'lsa xatoni yashirmaymiz
    console.error(`[sheets] ${kind} ${dedupKey} Sheets xato, navbatda qoldi:`, String(e?.message ?? e));
    const { data: cur } = await db.from("bot_sheet_outbox").select("attempts").eq("id", id).maybeSingle();
    await db.from("bot_sheet_outbox").update({ status: "pending", attempts: ((cur as any)?.attempts ?? 0) + 1, error: String(e?.message ?? e).slice(0, 500) }).eq("id", id);
  }
  return rows.length;
}

async function writeOutboxRows(db: any, kind: "fuel" | "hr" | "dpr", t: { id: string; tab: string }, rows: (string | number)[][], width: number, dedupKey: string) {
  const items: LedgerItem[] = await Promise.all(rows.map(async (row, i) => ({
    qid: String(i), source_table: kind, record_id: await stableUuid(`${kind}:${dedupKey}:${i}`), row,
  })));
  const { deferred } = await writeRowsOnce(db, t, width, items);
  if (deferred.size) throw new Error(`${deferred.size} ta qator boshqa urinishda yozilmoqda`);
}

/** Yozilmay qolgan bot yozuvlarini qayta yuboradi (ledger takrorlanishga yo'l qo'ymaydi). */
export async function flushBotOutbox(limit = 50): Promise<{ written: number; failed: number }> {
  const db = sb();
  const { data } = await db.from("bot_sheet_outbox").select("*").eq("status", "pending").lt("attempts", 20)
    .order("created_at", { ascending: true }).limit(limit);
  let written = 0, failed = 0;
  for (const o of (data ?? []) as any[]) {
    try {
      await writeOutboxRows(db, o.kind, { id: o.spreadsheet_id, tab: o.tab }, o.rows, o.width, o.dedup_key);
      await db.from("bot_sheet_outbox").update({ status: "written", written_at: new Date().toISOString(), error: null }).eq("id", o.id);
      written++;
    } catch (e: any) {
      failed++;
      await db.from("bot_sheet_outbox").update({ attempts: o.attempts + 1, error: String(e?.message ?? e).slice(0, 500) }).eq("id", o.id);
    }
  }
  return { written, failed };
}

/**
 * Eski (ID siz) qatorlar tahlili. Faqat qat'iy dalil: Sheet'dagi «Innosite ID» qiymati.
 * Business maydonlari (sana/summa/kategoriya) bo'yicha hech qanday taxminiy moslash yo'q.
 */
export async function legacyPreview(target: { id: string; tab: string }, width: number) {
  const db = sb();
  const idCol = await ensureIdColumn(target.id, target.tab, width);
  const L = colLetter(idCol);
  const vals = ((await gw(`/spreadsheets/${target.id}/values/${quoteTab(target.tab)}!A:${L}?valueRenderOption=FORMATTED_VALUE`)).values ?? []) as unknown[][];
  const byId = new Map<string, number[]>();
  const unmatched: { row: number; cells: string[] }[] = [];
  vals.forEach((r, i) => {
    if (i === 0) return;
    const filled = (r ?? []).slice(0, width).some((c) => String(c ?? "").trim() !== "");
    if (!filled) return;
    const id = String(r?.[idCol] ?? "").trim();
    if (id) byId.set(id, [...(byId.get(id) ?? []), i + 1]);
    else unmatched.push({ row: i + 1, cells: (r ?? []).slice(0, width).map((c) => String(c ?? "")) });
  });
  const conflicts: { id: string; rows: number[]; reason: string }[] = [];
  const parsed = [...byId.keys()].map((k) => { const [s, r] = k.split(":"); return { k, s, r }; });
  const expIds = parsed.filter((p) => p.s === "expenses").map((p) => p.r);
  const incIds = parsed.filter((p) => p.s === "incomes").map((p) => p.r);
  const exist = new Set<string>();
  for (const [tbl, ids] of [["expenses", expIds], ["incomes", incIds]] as const) {
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await db.from(tbl).select("id").in("id", ids.slice(i, i + 300));
      (data ?? []).forEach((d: any) => exist.add(`${tbl}:${d.id}`));
    }
  }
  for (const p of parsed) {
    const rows = byId.get(p.k)!;
    if (rows.length > 1) conflicts.push({ id: p.k, rows, reason: "ID bir nechta qatorda" });
    else if (!exist.has(p.k)) conflicts.push({ id: p.k, rows, reason: "Bazada bunday yozuv yo'q" });
  }
  // Ledger "written" bo'lib Sheet'da ID topilmagan yozuvlar — avtomatik tiklash uchun dalil yetarli emas
  const { data: led } = await db.from("sheet_sync_ledger").select("source_table,record_id").eq("spreadsheet_id", target.id).eq("tab", target.tab).eq("status", "written");
  const ledgerWithoutRow = ((led ?? []) as any[]).filter((l) => !byId.has(`${l.source_table}:${l.record_id}`)).length;
  return {
    total: vals.length - 1, alreadyMapped: byId.size - conflicts.length, matched: 0,
    unmatched: unmatched.length, conflicts, ledgerWithoutRow,
    unmatchedSample: unmatched.slice(-200).reverse(),
  };
}

/**
 * Qo'lda bog'lash: aniq Sheet qatori ↔ aniq Innosite UUID. Idempotent: bir xil bog'lash qayta
 * chaqirilsa hech narsa o'zgarmaydi. Qator allaqachon boshqa ID ga ega bo'lsa yoki UUID Sheet'da
 * boshqa joyda bo'lsa — rad etiladi.
 */
export async function legacyLink(target: { id: string; tab: string }, width: number, sheetRow: number, src: "expenses" | "incomes", recordId: string, actor: { id: string; email: string | null }, note?: string) {
  if (!/^[0-9a-f-]{36}$/i.test(recordId)) throw new Error("UUID noto'g'ri");
  if (!Number.isInteger(sheetRow) || sheetRow < 2) throw new Error("Qator raqami noto'g'ri");
  const db = sb();
  const { data: rec } = await db.from(src).select("id").eq("id", recordId).maybeSingle();
  if (!rec) throw new Error("Bunday Innosite yozuvi topilmadi");
  const key = sourceKey(src, recordId);
  const idCol = await ensureIdColumn(target.id, target.tab, width);
  const L = colLetter(idCol);
  const col = ((await gw(`/spreadsheets/${target.id}/values/${quoteTab(target.tab)}!${L}:${L}`)).values ?? []) as unknown[][];
  const elsewhere = col.findIndex((r, i) => i + 1 !== sheetRow && String(r?.[0] ?? "").trim() === key);
  if (elsewhere >= 0) throw new Error(`Bu UUID allaqachon ${elsewhere + 1}-qatorda`);
  const cur = String(col[sheetRow - 1]?.[0] ?? "").trim();
  if (cur === key) return { ok: true, already: true };
  if (cur) throw new Error(`Qatorda boshqa ID bor: ${cur}`);
  const rowVals = (((await gw(`/spreadsheets/${target.id}/values/${quoteTab(target.tab)}!A${sheetRow}:${colLetter(width - 1)}${sheetRow}`)).values ?? [])[0] ?? []) as unknown[];
  if (!rowVals.some((c) => String(c ?? "").trim())) throw new Error("Qator bo'sh");
  const { error: lErr } = await db.from("sheet_legacy_links").insert({
    spreadsheet_id: target.id, tab: target.tab, sheet_row: sheetRow, source_table: src, record_id: recordId,
    row_snapshot: rowVals, linked_by: actor.id, linked_by_email: actor.email, note: note ?? null,
  });
  if (lErr) throw new Error(lErr.code === "23505" ? "Bu qator yoki yozuv allaqachon bog'langan" : lErr.message);
  await gw(`/spreadsheets/${target.id}/values/${quoteTab(target.tab)}!${L}${sheetRow}?valueInputOption=RAW`, { method: "PUT", body: { values: [[key]] } });
  // Endi bu yozuv ID orqali yangilanadi; INSERT qayta bo'lmasligi uchun ledger "written"
  await db.from("sheet_sync_ledger").upsert({
    source_table: src, record_id: recordId, spreadsheet_id: target.id, tab: target.tab,
    status: "written", write_token: `manual-link:${crypto.randomUUID()}`, written_at: new Date().toISOString(),
  }, { onConflict: "source_table,record_id,spreadsheet_id,tab", ignoreDuplicates: true });
  return { ok: true, already: false };
}

/** Monitor uchun loyiha jadvali nishonlari (Master_Data va bosh jadval). */
export async function syncTargets(): Promise<{ label: string; id: string; tab: string; width: number }[]> {
  const db = sb();
  const { data } = await db.from("app_settings").select("key,value").in("key", ["sheets_sync_spreadsheet_id", "sheets_sync_tab"]);
  const c = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value])) as Record<string, string>;
  const out: { label: string; id: string; tab: string; width: number }[] = [];
  if (c["sheets_sync_spreadsheet_id"]) out.push({ label: "Master_Data", id: c["sheets_sync_spreadsheet_id"], tab: c["sheets_sync_tab"] || "Master_Data", width: 8 });
  return out;
}

/** Google javob bergan (aniq) HTTP xato — 4xx bo'lsa, atomik so'rov qo'llanmagani aniq. */
class SheetsHttpError extends Error {
  constructor(public status: number, body: string) { super(`Google Sheets [${status}]: ${body.slice(0, 400)}`); }
}

async function gw(path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`${GATEWAY}${path}`, {
    method: init?.method ?? "GET", headers: gwHeaders(),
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw new SheetsHttpError(res.status, await res.text());
  return res.json();
}

/** Mavjud tokenlardan qaysilari Sheet'da (metama'lumot sifatida) borligini qaytaradi. */
async function findSyncTokens(spreadsheetId: string, tokens: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    const r = await gw(`/spreadsheets/${spreadsheetId}/developerMetadata:search`, {
      method: "POST",
      body: { dataFilters: chunk.map((v) => ({ developerMetadataLookup: { metadataKey: SYNC_META_KEY, metadataValue: v } })) },
    });
    for (const m of (r.matchedDeveloperMetadata ?? []) as any[]) {
      const v = m?.developerMetadata?.metadataValue;
      if (v) found.add(String(v));
    }
  }
  return found;
}

/** Faqat ledger "written" bo'lgandan keyin chaqiriladi; xato bo'lsa e'tiborsiz (faqat joy egallaydi). */
async function deleteSyncTokens(spreadsheetId: string, tokens: string[]) {
  if (!tokens.length) return;
  try {
    await gw(`/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: { requests: tokens.map((v) => ({ deleteDeveloperMetadata: { dataFilter: { developerMetadataLookup: { metadataKey: SYNC_META_KEY, metadataValue: v } } } })) },
    });
  } catch (e) { console.error("[sheets-sync] metama'lumotni o'chirib bo'lmadi", e); }
}

const cellText = (v: string | number) => String(v ?? "").replace(/[\t\r\n]+/g, " ");
const quoteTab = (tab: string) => (/^[A-Za-z0-9_]+$/.test(tab) ? tab : `'${tab}'`);
const colLetter = (idx: number) => { let s = "", n = idx + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// ===================== Manba ID ustuni (insert/update ajratish) =====================
// Har kassa qatori Sheet'da yashirin «Innosite ID» ustuniga `expenses:<uuid>` /
// `incomes:<uuid>` ko'rinishida manba ID si bilan yoziladi. UPDATE faqat shu ID bo'yicha
// topilgan qatorni yangilaydi. Sana/summa/kategoriya kabi biznes maydonlari hech qachon
// takror/moslik aniqlash uchun ishlatilmaydi (bir xil ikki xarajat real bo'lishi mumkin).
const ID_HEADER = "Innosite ID";
const idColCache = new Map<string, number>();
const sourceKey = (src: string, rid: string) => `${src}:${rid}`;

/** «Innosite ID» ustunini topadi; bo'lmasa ma'lumotlardan o'ngdagi birinchi bo'sh ustunda yashirin holda yaratadi. */
async function ensureIdColumn(spreadsheetId: string, tab: string, width: number): Promise<number> {
  const ck = `${spreadsheetId}|${tab}`;
  if (idColCache.has(ck)) return idColCache.get(ck)!;
  const meta = await gw(`/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`);
  const sh = ((meta.sheets ?? []) as any[]).find((s) => s.properties?.title === tab);
  if (!sh) throw new SheetsHttpError(404, `«${tab}» varag'i topilmadi`);
  const sheetId = sh.properties.sheetId as number;
  const colCount = Number(sh.properties.gridProperties?.columnCount ?? 0);
  const t = quoteTab(tab);
  const hdr = (((await gw(`/spreadsheets/${spreadsheetId}/values/${t}!1:1`)).values ?? [])[0] ?? []) as unknown[];
  let idx = hdr.findIndex((v) => String(v ?? "").trim() === ID_HEADER);
  if (idx < 0) {
    let lastHdr = -1;
    hdr.forEach((v, i) => { if (String(v ?? "") !== "") lastHdr = i; });
    idx = Math.max(width, lastHdr + 1);
    // Faqat butunlay bo'sh ustunni olamiz — qo'lda kiritilgan ma'lumot ustiga yozilmaydi
    for (; idx < colCount; idx++) {
      const L = colLetter(idx);
      const c = ((await gw(`/spreadsheets/${spreadsheetId}/values/${t}!${L}:${L}`)).values ?? []) as unknown[][];
      if (!c.some((r) => r?.[0] !== undefined && String(r[0]) !== "")) break;
    }
    const requests: unknown[] = [];
    if (idx >= colCount) requests.push({ appendDimension: { sheetId, dimension: "COLUMNS", length: idx - colCount + 1 } });
    requests.push({ updateCells: { start: { sheetId, rowIndex: 0, columnIndex: idx }, rows: [{ values: [{ userEnteredValue: { stringValue: ID_HEADER } }] }], fields: "userEnteredValue" } });
    requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: idx, endIndex: idx + 1 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } });
    await gw(`/spreadsheets/${spreadsheetId}:batchUpdate`, { method: "POST", body: { requests } });
  }
  idColCache.set(ck, idx);
  return idx;
}

/**
 * Mavjud qatorlarni FAQAT manba ID si bo'yicha yangilaydi (A:width). ID topilmasa yoki
 * bir nechta qatorda bo'lsa — hech narsa yozilmaydi va yangi qator ham qo'shilmaydi.
 */
async function updateRowsById(spreadsheetId: string, tab: string, width: number, idCol: number, items: { key: string; row: (string | number)[] }[]) {
  const missing = new Set<string>(), ambiguous = new Set<string>(), updated = new Set<string>();
  if (!items.length) return { updated, missing, ambiguous };
  const meta = await gw(`/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`);
  const sh = ((meta.sheets ?? []) as any[]).find((s) => s.properties?.title === tab);
  if (!sh) throw new SheetsHttpError(404, `«${tab}» varag'i topilmadi`);
  const sheetId = sh.properties.sheetId as number;
  const L = colLetter(idCol);
  const col = ((await gw(`/spreadsheets/${spreadsheetId}/values/${quoteTab(tab)}!${L}:${L}`)).values ?? []) as unknown[][];
  const pos = new Map<string, number[]>();
  col.forEach((r, i) => { if (i === 0) return; const v = String(r?.[0] ?? "").trim(); if (v) { if (!pos.has(v)) pos.set(v, []); pos.get(v)!.push(i); } });
  const requests: unknown[] = [];
  for (const it of items) {
    const p = pos.get(it.key) ?? [];
    if (p.length === 0) { missing.add(it.key); continue; }
    if (p.length > 1) { ambiguous.add(it.key); continue; }
    requests.push({ pasteData: { coordinate: { sheetId, rowIndex: p[0], columnIndex: 0 }, data: it.row.slice(0, width).map(cellText).join("\t"), type: "PASTE_VALUES", delimiter: "\t" } });
    updated.add(it.key);
  }
  if (requests.length) await gw(`/spreadsheets/${spreadsheetId}:batchUpdate`, { method: "POST", body: { requests } });
  return { updated, missing, ambiguous };
}

/** Qatorlar + token metama'lumotini (va berilsa manba ID larini) bitta atomik batchUpdate bilan yozadi. */
async function atomicAppendWithToken(spreadsheetId: string, tab: string, rows: (string | number)[][], width: number, token: string, ids?: { col: number; values: string[] }) {
  const meta = await gw(`/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties.rowCount)`);
  const sh = ((meta.sheets ?? []) as any[]).find((s) => s.properties?.title === tab);
  if (!sh) throw new SheetsHttpError(404, `«${tab}» varag'i topilmadi`);
  const sheetId = sh.properties.sheetId as number;
  const rowCount = Number(sh.properties.gridProperties?.rowCount ?? 0);
  // Keyingi bo'sh qator — avvalgi appendRows bilan bir xil qoida (A ustundagi oxirgi to'la qator)
  const t = quoteTab(tab);
  const col = ((await gw(`/spreadsheets/${spreadsheetId}/values/${t}!A:A`)).values ?? []) as unknown[][];
  let lastFilled = 0;
  col.forEach((r, i) => { if (r?.[0] !== undefined && String(r[0]) !== "") lastFilled = i + 1; });
  const startIndex = Math.max(2, lastFilled + 1) - 1; // 0-asosli
  const data = rows.map((r) => r.slice(0, width).map(cellText).join("\t")).join("\n");
  const requests: unknown[] = [];
  const need = startIndex + rows.length - rowCount;
  if (need > 0) requests.push({ appendDimension: { sheetId, dimension: "ROWS", length: need } });
  requests.push({ pasteData: { coordinate: { sheetId, rowIndex: startIndex, columnIndex: 0 }, data, type: "PASTE_VALUES", delimiter: "\t" } });
  if (ids) {
    requests.push({ updateCells: {
      start: { sheetId, rowIndex: startIndex, columnIndex: ids.col },
      rows: ids.values.map((v) => ({ values: [{ userEnteredValue: { stringValue: v } }] })),
      fields: "userEnteredValue",
    } });
  }
  requests.push({ createDeveloperMetadata: { developerMetadata: {
    metadataKey: SYNC_META_KEY, metadataValue: token, visibility: "DOCUMENT",
    location: { dimensionRange: { sheetId, dimension: "ROWS", startIndex, endIndex: startIndex + 1 } },
  } } });
  await gw(`/spreadsheets/${spreadsheetId}:batchUpdate`, { method: "POST", body: { requests } });
}

/**
 * Bitta nishonga takrorsiz yozish. Qaytaradi: deferred — boshqa ishchi hozir yozayotgan
 * yoki natijasi hali aniqlanmagan navbat id lari (keyinroq qayta urinish kerak).
 * Xato bo'lsa throw qiladi (ledger "writing" qoladi va keyin xavfsiz hal qilinadi).
 */
async function writeRowsOnce(db: any, target: { id: string; tab: string }, width: number, items: LedgerItem[], idCol?: number): Promise<{ deferred: Set<string> }> {
  const deferred = new Set<string>();
  if (!items.length) return { deferred };
  const keyOf = (s: string, r: string) => `${s}:${r}`;
  const byKey = new Map(items.map((i) => [keyOf(i.source_table, i.record_id), i]));
  const token = crypto.randomUUID();
  const toWrite = new Map<string, LedgerItem>(); // ledger id -> item

  const { data: existing, error: lErr } = await db.from("sheet_sync_ledger")
    .select("id,source_table,record_id,status,write_token,attempt_at")
    .eq("spreadsheet_id", target.id).eq("tab", target.tab)
    .in("record_id", Array.from(new Set(items.map((i) => i.record_id))));
  if (lErr) throw new Error(`ledger: ${lErr.message}`);

  const seen = new Set<string>();
  const stale = new Map<string, any[]>(); // eski token -> ledger qatorlari
  for (const l of (existing ?? []) as any[]) {
    const it = byKey.get(keyOf(l.source_table, l.record_id));
    if (!it) continue;
    seen.add(keyOf(l.source_table, l.record_id));
    if (l.status === "written") continue; // allaqachon yozilgan — o'tkazib yuboriladi
    if (Date.now() - new Date(l.attempt_at).getTime() < SYNC_STALE_MS) { deferred.add(it.qid); continue; }
    if (!stale.has(l.write_token)) stale.set(l.write_token, []);
    stale.get(l.write_token)!.push(l);
  }

  // Noaniq (osilib qolgan) yozuvlarni Sheet metama'lumoti orqali hal qilish
  if (stale.size) {
    const found = await findSyncTokens(target.id, [...stale.keys()]);
    const confirmed: string[] = [];
    for (const [old, rows] of stale) {
      const ids = rows.map((r) => r.id);
      if (found.has(old)) {
        const { error } = await db.from("sheet_sync_ledger")
          .update({ status: "written", written_at: new Date().toISOString() })
          .in("id", ids).eq("write_token", old).eq("status", "writing");
        if (error) rows.forEach((r) => deferred.add(byKey.get(keyOf(r.source_table, r.record_id))!.qid));
        else confirmed.push(old);
      } else {
        // Yozilmagan — tokenni CAS bilan egallab, qayta yozamiz
        const { data: took } = await db.from("sheet_sync_ledger")
          .update({ write_token: token, attempt_at: new Date().toISOString() })
          .in("id", ids).eq("write_token", old).eq("status", "writing").select("id,source_table,record_id");
        const tookIds = new Set(((took ?? []) as any[]).map((r) => r.id));
        for (const r of rows) {
          const it = byKey.get(keyOf(r.source_table, r.record_id))!;
          if (tookIds.has(r.id)) toWrite.set(r.id, it); else deferred.add(it.qid);
        }
      }
    }
    await deleteSyncTokens(target.id, confirmed);
  }

  // Yangi yozuvlarni band qilish (UNIQUE — parallel ishchilardan faqat bittasi oladi)
  const fresh = items.filter((i) => !seen.has(keyOf(i.source_table, i.record_id)));
  if (fresh.length) {
    const { data: ins, error: iErr } = await db.from("sheet_sync_ledger").upsert(
      fresh.map((i) => ({ source_table: i.source_table, record_id: i.record_id, spreadsheet_id: target.id, tab: target.tab, status: "writing", write_token: token })),
      { onConflict: "source_table,record_id,spreadsheet_id,tab", ignoreDuplicates: true },
    ).select("id,source_table,record_id");
    if (iErr) throw new Error(`ledger: ${iErr.message}`);
    const got = new Set<string>();
    for (const r of (ins ?? []) as any[]) {
      const k = keyOf(r.source_table, r.record_id);
      got.add(k);
      toWrite.set(r.id, byKey.get(k)!);
    }
    fresh.forEach((i) => { if (!got.has(keyOf(i.source_table, i.record_id))) deferred.add(i.qid); });
  }

  if (!toWrite.size) return { deferred };
  const ordered = [...toWrite.values()]; // navbat tartibi saqlanadi
  ordered.sort((a, b) => items.indexOf(a) - items.indexOf(b));
  try {
    await atomicAppendWithToken(target.id, target.tab, ordered.map((i) => i.row), width, token,
      idCol === undefined ? undefined : { col: idCol, values: ordered.map((i) => sourceKey(i.source_table, i.record_id)) });
  } catch (e) {
    // Google 4xx bilan rad etgan bo'lsa, atomik so'rov qo'llanmagani aniq — keyingi
    // urinishda kutmasdan (baribir metama'lumot tekshiruvi bilan) hal qilinsin.
    // Timeout/tarmoq/5xx — noaniq: ledger SYNC_STALE_MS o'tguncha tegilmaydi.
    if (e instanceof SheetsHttpError && e.status >= 400 && e.status < 500) {
      await db.from("sheet_sync_ledger").update({ attempt_at: new Date(0).toISOString() })
        .eq("write_token", token).eq("status", "writing");
    }
    throw e;
  }
  const { error: wErr } = await db.from("sheet_sync_ledger")
    .update({ status: "written", written_at: new Date().toISOString() })
    .eq("write_token", token).eq("status", "writing");
  if (wErr) {
    // Sheet'ga yozildi, lekin ledger yangilanmadi — metama'lumot qoladi, keyingi
    // urinish uni topib "written" qiladi (qayta yozmaydi).
    ordered.forEach((i) => deferred.add(i.qid));
    return { deferred };
  }
  await deleteSyncTokens(target.id, [token]);
  return { deferred };
}

export async function flushSheetSync(limit = 200): Promise<SheetSyncResult> {
  const db = sb();
  const errors: string[] = [];

  const { data: settingRows } = await db.from("app_settings").select("key,value").in("key", [
    "sheets_sync_enabled", "sheets_sync_spreadsheet_id", "sheets_sync_tab", "sheets_sync_project_id",
  ]);
  const cfg = Object.fromEntries((settingRows ?? []).map((r: any) => [r.key, r.value])) as Record<string, string>;
  if (String(cfg["sheets_sync_enabled"] ?? "false") !== "true") {
    return { pending: 0, appended: 0, skipped: 0, errors: ["sinxronizatsiya o'chirilgan"] };
  }
  const legacyId = cfg["sheets_sync_spreadsheet_id"] || null;
  const legacyTab = cfg["sheets_sync_tab"] || "Master_Data";
  const legacyProject = cfg["sheets_sync_project_id"] || null;

  // Osilib qolgan "processing" navbat qatorlarini qayta navbatga qo'yish xavfsiz:
  // haqiqiy yozish holati navbatda emas, sheet_sync_ledger da (nishon bo'yicha) saqlanadi,
  // va noaniq holat writeRowsOnce ichida Sheet metama'lumoti orqali hal qilinadi.
  await db.from("sheet_sync_queue").update({ status: "pending" }).eq("status", "processing")
    .lt("synced_at", new Date(Date.now() - SYNC_STALE_MS).toISOString());

  const { data: candidates, error: qErr } = await db.from("sheet_sync_queue").select("id")
    .eq("status", "pending").order("created_at", { ascending: true }).limit(limit);
  if (qErr) return { pending: 0, appended: 0, skipped: 0, errors: [qErr.message] };
  if (!candidates?.length) return { pending: 0, appended: 0, skipped: 0, errors: [] };

  const { data: claimed } = await db.from("sheet_sync_queue")
    .update({ status: "processing", synced_at: new Date().toISOString() })
    .in("id", candidates.map((c: any) => c.id)).eq("status", "pending")
    .select("id,source_table,record_id,project_id,attempts,created_at,update_seq,needs_update,ever_synced");
  const queue = ((claimed ?? []) as any[]).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  if (!queue.length) return { pending: 0, appended: 0, skipped: 0, errors: [] };

  const expIds = queue.filter((q) => q.source_table === "expenses").map((q) => q.record_id);
  const incIds = queue.filter((q) => q.source_table === "incomes").map((q) => q.record_id);
  const { data: expenses } = expIds.length
    ? await db.from("expenses").select("id,project_id,expense_date,description,category,qty,unit_price,amount,paid_by").in("id", expIds)
    : { data: [] as any[] };
  const { data: incomes } = incIds.length
    ? await db.from("incomes").select("id,project_id,income_date,description,category,amount,payer").in("id", incIds)
    : { data: [] as any[] };
  const expMap = new Map((expenses ?? []).map((r: any) => [r.id, r]));
  const incMap = new Map((incomes ?? []).map((r: any) => [r.id, r]));

  const projIds = Array.from(new Set([...(expenses ?? []), ...(incomes ?? [])].map((r: any) => r.project_id).filter(Boolean)));
  const { data: projects } = projIds.length
    ? await db.from("projects").select("id,name,sheet_id,sheet_tab").in("id", projIds)
    : { data: [] as any[] };
  const projMap = new Map((projects ?? []).map((p: any) => [p.id, p]));

  // Loyiha jadvali: loyihaning o'z sheet_id si, bo'lmasa eski umumiy sozlama (faqat o'sha loyiha uchun)
  const targetFor = (pid: string | null): { id: string; tab: string } | null => {
    const p = pid ? projMap.get(pid) : null;
    if (p?.sheet_id) return { id: p.sheet_id, tab: p.sheet_tab || "Master_Data" };
    if (legacyId && (!legacyProject || legacyProject === pid)) return { id: legacyId, tab: legacyTab };
    return null;
  };

  type Item = { qid: string; src: "expenses" | "incomes"; rid: string; pid: string | null; row: (string | number)[] };
  const items: Item[] = [];
  const missingIds: string[] = [];
  const catIdx = await loadCategoryIndex(db);
  const catWarnings: { source_table: string; record_id: string; detail: string }[] = [];
  for (const q of queue) {
    if (q.source_table === "expenses") {
      const e = expMap.get(q.record_id);
      if (!e) { missingIds.push(q.id); continue; }
      const c = resolveSheetCategory(catIdx, "expense", e.category, e.description);
      if (c.warning) catWarnings.push({ source_table: "expenses", record_id: q.record_id, detail: c.warning });
      items.push({ qid: q.id, src: "expenses", rid: q.record_id, pid: e.project_id ?? q.project_id, row: [
        fmtDate(e.expense_date), e.description ?? e.category ?? "", c.category,
        num(e.qty), num(e.unit_price), num(e.amount), e.paid_by ?? "", "CHIQIM",
      ] });
    } else if (q.source_table === "incomes") {
      const i = incMap.get(q.record_id);
      if (!i) { missingIds.push(q.id); continue; }
      const c = resolveSheetCategory(catIdx, "income", i.category, i.description);
      if (c.warning) catWarnings.push({ source_table: "incomes", record_id: q.record_id, detail: c.warning });
      items.push({ qid: q.id, src: "incomes", rid: q.record_id, pid: i.project_id ?? q.project_id, row: [
        fmtDate(i.income_date), i.description ?? "Kirim", c.category, "", "", num(i.amount), i.payer ?? "", "KIRIM",
      ] });
    } else missingIds.push(q.id);
  }
  // Noma'lum kategoriya syncni to'xtatmaydi — monitoringga ogohlantirish yoziladi
  if (catWarnings.length) {
    const { error: wErr } = await db.from("sheet_sync_warnings").upsert(
      catWarnings.map((w) => ({ ...w, kind: "unknown_category", last_seen: new Date().toISOString(), resolved: false })),
      { onConflict: "source_table,record_id,kind" });
    if (wErr) console.error("[sheets-sync] warnings:", wErr.message);
  }
  if (missingIds.length) {
    await db.from("sheet_sync_queue").update({ status: "skipped", synced_at: new Date().toISOString(), error: "yozuv topilmadi" }).in("id", missingIds);
  }
  if (!items.length) return { pending: queue.length, appended: 0, skipped: missingIds.length, errors };

  const failed = new Map<string, string>();
  const deferred = new Set<string>();
  const warns = new Map<string, string>();
  const fail = (ids: string[], msg: string) => { errors.push(msg); ids.forEach((id) => failed.set(id, msg)); };
  const toLedger = (it: Item, row: (string | number)[]): LedgerItem => ({ qid: it.qid, source_table: it.src, record_id: it.rid, row });
  const qById = new Map(queue.map((q: any) => [q.id, q]));

  /**
   * Bitta nishon uchun INSERT/UPDATE ni faqat manba ID (ledger + «Innosite ID» ustuni) orqali ajratadi:
   *  - ledger yo'q va yozuv hech qachon sync bo'lmagan, yoki ledger "writing" → INSERT (writeRowsOnce, takrorsiz)
   *  - ledger "written" va yozuv tahrirlangan → UPDATE (ID bo'yicha topilgan qatorga)
   *  - ledger yo'q, lekin yozuv avval sync bo'lgan (ledgerdan oldingi eski yozuv) → faqat ID bo'yicha UPDATE;
   *    ID topilmasa hech narsa yozilmaydi (yangi qator qo'shilmaydi).
   */
  const syncTarget = async (t: { id: string; tab: string }, width: number, list: { it: Item; row: (string | number)[] }[], label: string) => {
    try {
      const idCol = await ensureIdColumn(t.id, t.tab, width);
      const { data: led, error } = await db.from("sheet_sync_ledger").select("source_table,record_id,status")
        .eq("spreadsheet_id", t.id).eq("tab", t.tab).in("record_id", list.map((x) => x.it.rid));
      if (error) throw new Error(`ledger: ${error.message}`);
      const st = new Map(((led ?? []) as any[]).map((l) => [sourceKey(l.source_table, l.record_id), l.status as string]));
      const ins: typeof list = [], upd: typeof list = [];
      for (const x of list) {
        const q = qById.get(x.it.qid);
        const s = st.get(sourceKey(x.it.src, x.it.rid));
        if (s === "writing" || (!s && !q?.ever_synced)) ins.push(x);
        else if (q?.needs_update) upd.push(x);
      }
      if (ins.length) {
        const r = await writeRowsOnce(db, t, width, ins.map((x) => toLedger(x.it, x.row)), idCol);
        r.deferred.forEach((q) => deferred.add(q));
      }
      if (upd.length) {
        const r = await updateRowsById(t.id, t.tab, width, idCol, upd.map((x) => ({ key: sourceKey(x.it.src, x.it.rid), row: x.row })));
        for (const x of upd) {
          const k = sourceKey(x.it.src, x.it.rid);
          if (r.missing.has(k)) warns.set(x.it.qid, `${label}: Sheet'da ID topilmadi (eski qator) — yangilanmadi, yangi qator qo'shilmadi`);
          else if (r.ambiguous.has(k)) warns.set(x.it.qid, `${label}: ID bir nechta qatorda — yangilanmadi`);
        }
      }
    } catch (e: any) { fail(list.map((x) => x.it.qid), `${label}: ${String(e?.message ?? e)}`); }
  };

  // 1) Har loyiha o'z jadvaliga
  const groups = new Map<string, { t: { id: string; tab: string }; items: Item[] }>();
  for (const it of items) {
    const t = targetFor(it.pid);
    if (!t) continue;
    const k = `${t.id}|${t.tab}`;
    if (!groups.has(k)) groups.set(k, { t, items: [] });
    groups.get(k)!.items.push(it);
  }
  for (const g of groups.values()) await syncTarget(g.t, 8, g.items.map((i) => ({ it: i, row: i.row })), "Loyiha jadvali");

  // Faqat Master_Data (loyiha jadvali) — bosh jadvalga sync o'chirilgan.

  const doneIds = items.map((i) => i.qid).filter((id) => !failed.has(id) && !deferred.has(id));
  // update_seq mos kelsagina "synced": ishlov paytida yozuv yana tahrirlangan bo'lsa navbatda qoladi
  for (const id of doneIds) {
    const q = qById.get(id);
    const w = warns.get(id) ?? null;
    if (w) console.warn(`[sheets-sync] ${q?.source_table}:${q?.record_id} ${w}`);
    await db.from("sheet_sync_queue")
      .update({ status: "synced", synced_at: new Date().toISOString(), error: w, ever_synced: true, needs_update: false })
      .eq("id", id).eq("update_seq", q?.update_seq ?? 0);
  }
  // Boshqa jarayon hali yozayotgan / natijasi aniqlanmagan yozuvlar: qayta navbatga
  // (ledger keyingi urinishda takror yozilishiga yo'l qo'ymaydi; urinish soni oshmaydi).
  const deferOnly = [...deferred].filter((id) => !failed.has(id));
  if (deferOnly.length) {
    await db.from("sheet_sync_queue").update({ status: "pending", error: "yozish natijasi tekshirilmoqda" }).in("id", deferOnly);
  }
  for (const [id, msg] of failed) {
    const row = queue.find((q) => q.id === id);
    await db.from("sheet_sync_queue").update({ status: "pending", error: msg.slice(0, 500), attempts: (row?.attempts ?? 0) + 1 }).eq("id", id);
  }
  return { pending: queue.length, appended: doneIds.length, skipped: missingIds.length, errors };
}

// ---------- Sheet'dan o'qish (bot AI suhbati uchun) ----------
type SheetRow = {
  row: number; date: string; name: string; cat: string; qty: number;
  price: number; amount: number; who: string; type: "KIRIM" | "CHIQIM";
};
let sheetRowsCache: { at: number; tab: string; rows: SheetRow[] } | null = null;

async function loadSheetRows(): Promise<{ tab: string; rows: SheetRow[] } | null> {
  if (sheetRowsCache && Date.now() - sheetRowsCache.at < 120_000) {
    return { tab: sheetRowsCache.tab, rows: sheetRowsCache.rows };
  }
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!lovableKey || !sheetsKey) return null;
  const db = sb();
  const { data: settingRows } = await db.from("app_settings").select("key,value")
    .in("key", ["sheets_sync_spreadsheet_id", "sheets_sync_tab"]);
  const cfg = Object.fromEntries((settingRows ?? []).map((r: any) => [r.key, r.value])) as Record<string, string>;
  const id = cfg["sheets_sync_spreadsheet_id"];
  const tab = cfg["sheets_sync_tab"] || "Master_Data";
  if (!id) return null;
  const res = await fetch(`${GATEWAY}/spreadsheets/${id}/values/${tab}!A:H?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`, {
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sheetsKey },
  });
  if (!res.ok) {
    console.error("sheet read", res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const values = ((await res.json()).values ?? []) as any[][];
  const toNum = (v: any) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0);
  const toDate = (v: any): string => {
    if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
    const s = String(v ?? "").trim();
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return s.slice(0, 10);
  };
  const rows: SheetRow[] = [];
  values.forEach((r, i) => {
    const date = toDate(r[0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || toNum(r[5]) === 0) return;
    rows.push({
      row: i + 1, date, name: String(r[1] ?? ""), cat: String(r[2] ?? ""), qty: toNum(r[3]),
      price: toNum(r[4]), amount: toNum(r[5]), who: String(r[6] ?? ""),
      type: /kirim/i.test(String(r[7] ?? "")) ? "KIRIM" : "CHIQIM",
    });
  });
  sheetRowsCache = { at: Date.now(), tab, rows };
  return { tab, rows };
}

const UZ_MONTHS: Record<string, string> = {
  yanvar: "01", fevral: "02", mart: "03", aprel: "04", may: "05", iyun: "06",
  iyul: "07", avgust: "08", sentabr: "09", sentyabr: "09", oktabr: "10", oktyabr: "10",
  noyabr: "11", dekabr: "12",
};
const STOP_WORDS = new Set([
  "qancha", "necha", "nima", "qaysi", "qachon", "kim", "kimga", "uchun", "bo'ldi", "boldi",
  "bor", "yo'q", "yoq", "jami", "summa", "summasi", "pul", "puli", "so'm", "som", "sum",
  "oyida", "oyda", "oyi", "kuni", "kunda", "hisobot", "berilgan", "olingan", "qilingan",
  "menga", "ayt", "ko'rsat", "korsat", "hammasi", "barcha", "edi", "ekan", "ming", "mln",
  "ketdi", "ketgan", "sarflandi", "sarf", "xarajat", "chiqim", "kirim", "boldi", "bugun",
  "kecha", "oxirgi", "eng", "toliq", "sana", "royxat", "royxati", "hisob", "qilib",
]);


const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", ғ: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
  и: "i", й: "y", к: "k", қ: "q", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ў: "o", ф: "f", х: "x", ҳ: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Kirill/lotin va yozilish farqlarini tekislash (Бензин=binzin=benzin). */
function spellNorm(s: string): string {
  return s
    .toLocaleLowerCase("uz")
    .replace(/[’‘`ʼʻ]/g, "'")
    .replace(/[\u0400-\u04FF]/g, (c) => CYR[c] ?? c)
    .replace(/o'/g, "o")
    .replace(/g'/g, "g")
    .replace(/binzin|benzin/g, "benzin")
    .replace(/salyarka|solyarka|dizel/g, "salyarka")
    .replace(/sement|cement|tsement/g, "sement");
}


/** Savoldan kalit so'z va sana filtrlarini ajratish. */
function parseQuery(q: string) {
  const low = spellNorm(q);
  const datePrefixes: string[] = [];
  const now = new Date(Date.now() + 5 * 3600000);
  const year = now.getUTCFullYear();
  for (const [name, mm] of Object.entries(UZ_MONTHS)) {
    if (low.includes(name)) {
      const ym = low.match(new RegExp(`(\\d{4})\\s*[- ]?\\s*${name}|${name}\\D{0,6}(\\d{4})`));
      const y = ym ? (ym[1] || ym[2]) : String(year);
      datePrefixes.push(`${y}-${mm}`);
    }
  }
  for (const m of low.matchAll(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/g)) {
    datePrefixes.push(`${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
  }
  for (const m of low.matchAll(/(\d{4})-(\d{2})(-(\d{2}))?/g)) datePrefixes.push(m[0]);
  const words = low
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/(larni|lardan|larga|lar|ning|niki|dagi|dan|ga|ni|da|ym)$/u, ""))
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w) && !(w in UZ_MONTHS));
  return { words: [...new Set(words)], datePrefixes: [...new Set(datePrefixes)] };
}

/** Master_Data (A:H) dan AI uchun xulosa + savolga mos qidiruv natijalari. 2 daqiqa keshlanadi. */
export async function getSheetContext(question?: string): Promise<string | null> {
  const loaded = await loadSheetRows();
  if (!loaded) return null;
  const { tab, rows } = loaded;
  const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ");
  const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  const sum = (arr: SheetRow[], t: string) => arr.filter((r) => r.type === t).reduce((s, r) => s + r.amount, 0);
  const inc = sum(rows, "KIRIM"), exp = sum(rows, "CHIQIM");
  const byCat = new Map<string, number>();
  const byDay = new Map<string, { i: number; e: number }>();
  for (const r of rows) {
    if (r.type === "CHIQIM") byCat.set(r.cat || "Boshqa", (byCat.get(r.cat || "Boshqa") ?? 0) + r.amount);
    const d = byDay.get(r.date) ?? { i: 0, e: 0 };
    if (r.type === "KIRIM") d.i += r.amount; else d.e += r.amount;
    byDay.set(r.date, d);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 31);
  const line = (r: SheetRow) =>
    `#${r.row} | ${r.date} | ${r.type} | ${r.name} | ${r.cat} | ${r.qty}×${fmt(r.price)} = ${fmt(r.amount)}${r.who ? ` | ${r.who}` : ""}`;

  // --- Aqlli qidiruv: butun jadval bo'yicha savolga mos yozuvlar ---
  let searchBlock = "";
  if (question && question.trim()) {
    const { words, datePrefixes } = parseQuery(question);
    if (words.length || datePrefixes.length) {
      const find = (useWords: string[]) =>
        rows
          .map((r) => {
            const hay = spellNorm(`${r.name} ${r.cat} ${r.who}`);
            let score = 0;
            let hits = 0;
            for (const w of useWords) if (hay.includes(w)) hits++;
            // Kalit so'zlar aytilgan bo'lsa — HAMMASI mos kelishi shart (aniqlik uchun)
            if (useWords.length && hits < useWords.length) return { r, score: 0 };
            score += hits * 2;
            if (datePrefixes.length) {
              // Sana ham aytilgan bo'lsa — faqat o'sha davrdagi yozuvlar
              if (datePrefixes.some((p) => r.date.startsWith(p))) score += 3;
              else score = 0;
            }
            return { r, score };
          })
          .filter((x) => x.score > 0);
      let scored = find(words.map(spellNorm));
      let note = "";
      // Hamma so'z birga topilmasa — eng ko'p uchragan bitta kalit so'z bo'yicha
      if (!scored.length && words.length > 1) {
        const best = words
          .map((w) => ({ w, n: find([spellNorm(w)]).length }))
          .filter((x) => x.n > 0)
          .sort((a, b) => a.n - b.n)[0];
        if (best) {
          scored = find([spellNorm(best.w)]);
          note = ` (faqat «${best.w}» bo'yicha)`;
        }
      }
      // Nom topilmasa — kamida davr bo'yicha ma'lumot beramiz
      if (!scored.length && words.length && datePrefixes.length) {
        scored = find([]);
        if (scored.length) note = ` («${words.join(" ")}» topilmadi, davr bo'yicha)`;
      }
      if (scored.length) {
        scored.sort((a, b) => b.score - a.score || b.r.date.localeCompare(a.r.date));
        const matched = scored.map((x) => x.r);
        const mInc = sum(matched, "KIRIM"), mExp = sum(matched, "CHIQIM");
        const shown = matched.slice(0, 250);
        searchBlock = [
          `\nQIDIRUV (butun jadval bo'yicha, kalit: ${[...words, ...datePrefixes].join(", ")}${note}):`,
          `Topildi: ${matched.length} ta yozuv. Ular bo'yicha JAMI CHIQIM: ${fmt(mExp)}; JAMI KIRIM: ${fmt(mInc)}.`,
          `MOS YOZUVLAR${matched.length > shown.length ? ` (eng mos ${shown.length} tasi ko'rsatilgan, jami summa yuqorida to'liq)` : ""}:`,
          shown.map(line).join("\n"),
        ].join("\n");
      } else {
        searchBlock = `\nQIDIRUV: «${question.slice(0, 120)}» bo'yicha butun jadvalda (${rows.length} yozuv) mos yozuv topilmadi.`;
      }
    }
  }


  // --- Shubhali yozuvlar tahlili (kod hisoblaydi, AI izohlaydi) ---
  let auditBlock = "";
  const qn = spellNorm(question ?? "");
  if (/shubha|gumon|tahlil|analiz|maslahat|tavsiya|xato|g'alati|galati|noodatiy|ortiqcha|tejash|nazorat|tekshir|narx|farq|qimmat|arzon|solishtir|bir xil/.test(qn)) {
    const { datePrefixes } = parseQuery(question ?? "");
    const scope = rows.filter((r) => r.type === "CHIQIM" && !/^\s*transfer\s*$/i.test(r.cat) &&
      (!datePrefixes.length || datePrefixes.some((p) => r.date.startsWith(p))));
    const flags: string[] = [];
    // Mahsulot kaliti: raqam, birlik va qo'shimcha so'zlarsiz birinchi 2 ta so'z
    const key = (r: SheetRow) => spellNorm(r.name)
      .replace(/[^\p{L}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^(kg|litr|dona|qop|metr|tonna|uchun|ga|va|bilan|olindi|olingan|sotib)$/.test(w))
      .slice(0, 2).join(" ");
    // 0) Bir xil mahsulot — har xil narx (narxi bor, kamida 2 marta olingan)
    const priceGroups = new Map<string, SheetRow[]>();
    for (const r of scope) {
      const k = key(r);
      if (/^(oylik|usta|ijara|transfer)$/i.test(r.cat.trim())) continue; // odamlar/ijara — mahsulot emas
      if (k && r.price > 0) priceGroups.set(k, [...(priceGroups.get(k) ?? []), r]);
    }
    const priceDiff = [...priceGroups.entries()]
      .map(([k, list]) => {
        const sorted = [...list].sort((a, b) => a.price - b.price);
        const lo = sorted[0]!, hi = sorted[sorted.length - 1]!;
        // Arzon narxda olinganda tejalishi mumkin bo'lgan summa
        const over = list.reduce((s, r) => s + Math.max(0, r.price - lo.price) * (r.qty || 1), 0);
        return { k, list, lo, hi, ratio: hi.price / lo.price, over };
      })
      .filter((x) => x.list.length >= 2 && x.ratio >= 1.1)
      .sort((a, b) => b.over - a.over)
      .slice(0, 15);
    const priceBlock = priceDiff.length
      ? `BIR XIL MAHSULOT — HAR XIL NARX (${priceDiff.length} ta, ortiqcha to'lov bo'yicha saralangan):\n` +
        priceDiff.map((x) =>
          `• «${x.k}» ${x.list.length} marta: eng arzon ${fmt(x.lo.price)} (#${x.lo.row}, ${x.lo.date}), eng qimmat ${fmt(x.hi.price)} (#${x.hi.row}, ${x.hi.date}) — farq ${Math.round((x.ratio - 1) * 100)}%, eng arzon narxda olinganda ~${fmt(x.over)} tejalardi${x.ratio >= 5 ? " (farq juda katta — birlik/miqdor xato yozilgan bo'lishi mumkin)" : ""}`,
        ).join("\n")
      : "BIR XIL MAHSULOT — HAR XIL NARX: bu davrda sezilarli (10%+) narx farqi topilmadi.";
    // 1) Takroriy: bir xil nom + summa, 0-2 kun ichida
    const seen = new Map<string, SheetRow[]>();
    for (const r of scope) {
      const k = `${key(r)}|${Math.round(r.amount)}`;
      seen.set(k, [...(seen.get(k) ?? []), r]);
    }
    for (const list of seen.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 1; i < list.length; i++) {
        const gap = (Date.parse(list[i]!.date) - Date.parse(list[i - 1]!.date)) / 864e5;
        if (gap <= 2) flags.push(`TAKRORIY? #${list[i - 1]!.row} va #${list[i]!.row}: «${list[i]!.name}» ${fmt(list[i]!.amount)} (${gap === 0 ? "bir kunda" : gap + " kun farq"})`);
      }
    }
    // 2) Narx odatdagidan baland (shu nomdagi o'rtacha narxdan 1.5x+)
    const byName = new Map<string, SheetRow[]>();
    for (const r of scope) if (r.price > 0) byName.set(key(r), [...(byName.get(key(r)) ?? []), r]);
    for (const list of byName.values()) {
      if (list.length < 3) continue;
      const ps = list.map((r) => r.price).sort((a, b) => a - b);
      const med = ps[Math.floor(ps.length / 2)]!;
      for (const r of list) if (med > 0 && r.price >= med * 1.5)
        flags.push(`NARX BALAND? #${r.row} «${r.name}» narx ${fmt(r.price)}, odatda ~${fmt(med)} (${(r.price / med).toFixed(1)}x)`);
    }
    // 3) Kategoriya ichida juda katta summa (mediandan 5x+)
    const byC = new Map<string, number[]>();
    for (const r of scope) byC.set(r.cat || "Boshqa", [...(byC.get(r.cat || "Boshqa") ?? []), r.amount]);
    for (const r of scope) {
      const arr = [...(byC.get(r.cat || "Boshqa") ?? [])].sort((a, b) => a - b);
      if (arr.length < 5) continue;
      const med = arr[Math.floor(arr.length / 2)]!;
      if (med > 0 && r.amount >= med * 5) flags.push(`KATTA SUMMA? #${r.row} ${r.date} «${r.name}» (${r.cat}) ${fmt(r.amount)}, kategoriyada odatda ~${fmt(med)}`);
    }
    // 4) Soni×narx ≠ summa, mas'ul yo'q, nom juda umumiy
    for (const r of scope) {
      if (r.qty > 0 && r.price > 0 && Math.abs(r.qty * r.price - r.amount) > Math.max(1000, r.amount * 0.01))
        flags.push(`HISOB MOS EMAS #${r.row}: ${r.qty}×${fmt(r.price)} ≠ ${fmt(r.amount)}`);
      if (!r.who && r.amount >= 1_000_000) flags.push(`MAS'UL YO'Q #${r.row} «${r.name}» ${fmt(r.amount)}`);
      if (r.name.trim().split(/\s+/).length < 2 && r.amount >= 2_000_000) flags.push(`IZOH QISQA #${r.row} «${r.name}» ${fmt(r.amount)} — nima uchunligi noaniq`);
    }
    const top = [...scope].sort((a, b) => b.amount - a.amount).slice(0, 8);
    const scopeExp = scope.reduce((s, r) => s + r.amount, 0);
    const cats = [...byC.entries()].map(([k, v]) => [k, v.reduce((s, x) => s + x, 0)] as const).sort((a, b) => b[1] - a[1]);
    auditBlock = [
      `\nTAHLIL (kod hisobladi${datePrefixes.length ? `, davr: ${datePrefixes.join(", ")}` : ", butun davr"}; ${scope.length} ta chiqim, jami ${fmt(scopeExp)}):`,
      `KATEGORIYA ULUSHI: ${cats.map(([k, v]) => `${k} ${fmt(v)} (${scopeExp ? Math.round((v / scopeExp) * 100) : 0}%)`).join("; ")}`,
      priceBlock,
      `ENG KATTA CHIQIMLAR:\n${top.map(line).join("\n")}`,
      flags.length ? `SHUBHALI BELGILAR (${flags.length}):\n${flags.slice(0, 40).join("\n")}` : "SHUBHALI BELGILAR: aniq topilmadi.",
    ].join("\n");
  }

  // Kunlik kumulyativ qoldiq — «X kirimdan oldin qoldiq qancha edi» kabi savollar uchun
  const balDays = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let runBal = 0;
  const balLines = balDays.map(([d, v]) => {
    runBal += v.i - v.e;
    return `${d}: ${fmt(runBal)}`;
  });

  const recent = [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
  return [
    `MANBA: Google Sheet «${tab}» (PV Olg'a naqd hisobot) — butun baza o'qildi. Bugun: ${today}. Jami yozuv: ${rows.length}.`,
    `JAMI KIRIM: ${fmt(inc)} so'm; JAMI CHIQIM: ${fmt(exp)} so'm; KASSA QOLDIQ: ${fmt(inc - exp)} so'm.`,
    `KATEGORIYALAR (chiqim, butun davr): ${[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${fmt(v)}`).join("; ")}`,
    `KUNLAR (sana: kirim/chiqim): ${days.map(([d, v]) => `${d}: ${fmt(v.i)}/${fmt(v.e)}`).join("; ")}`,
    `KUNLIK QOLDIQ (har bir kunning oxiridagi kassa qoldig'i, o'sish tartibida): ${balLines.join("; ")}. Bu ro'yxatdan istalgan kunning yoki istalgan kirimdan OLDINGI qoldiqni aniqlash mumkin.`,
    auditBlock || searchBlock,
    `OXIRGI YOZUVLAR:\n${recent.map(line).join("\n")}`,
  ].filter(Boolean).join("\n");
}


// ---------- Kunlik PDF hisobot (Sheet asosida) ----------
const UZ_MON_ORDER = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

/** «kechagi kun hisoboti», «bugungi hisobot pdf», «25.09.2026 hisobot», «12-sentabr hisoboti» → sana. */
export function detectDayReportRequest(q: string): string | null {
  const low = spellNorm(q);
  if (!/hisobot|otchet|pdf/.test(low)) return null;
  const now = new Date(Date.now() + 5 * 3600000);
  const shift = (d: number) => new Date(now.getTime() - d * 86400000).toISOString().slice(0, 10);
  if (/avvalgi\s*kun|oldingi\s*kun|kechadan\s*oldin|o?tgan\s*kun\s*oldin/.test(low)) return shift(2);
  if (/kecha/.test(low)) return shift(1);
  if (/bugun/.test(low)) return shift(0);
  const m = low.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  const iso = low.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  for (const [name, mm] of Object.entries(UZ_MONTHS)) {
    const dm = low.match(new RegExp(`(\\d{1,2})\\s*[- ]?\\s*${name}`));
    if (dm) return `${now.getUTCFullYear()}-${mm}-${dm[1]!.padStart(2, "0")}`;
  }
  // «29 sana», «29-chi», «29 kun» → joriy oy
  const dn = low.match(/\b(\d{1,2})\s*[- ]?\s*(sana|chi|kun|число)/);
  if (dn && Number(dn[1]) >= 1 && Number(dn[1]) <= 31) {
    const d = Number(dn[1]);
    // Kelajakdagi kun bo'lsa — o'tgan oy
    const base = d > now.getUTCDate() ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)) : now;
    return `${base.toISOString().slice(0, 7)}-${String(d).padStart(2, "0")}`;
  }
  // Sana aytilmasa — bugungi kun
  return shift(0);
}

export async function buildSheetDayPdf(date: string): Promise<
  { bytes: Uint8Array; count: number; inc: number; exp: number; balance: number } | null
> {
  const loaded = await loadSheetRows();
  if (!loaded) return null;
  // Transfer (xodimlar orasida pul o'tkazish) loyiha balansiga ta'sir qilmaydi — PDF'dan chiqariladi.
  const all = loaded.rows.filter((r) => !/^\s*transfer\s*$/i.test(String(r.cat ?? "")));
  const day = all.filter((r) => r.date === date).sort((a, b) => a.row - b.row);
  const before = all.filter((r) => r.date < date);
  const sumT = (arr: SheetRow[], t: string) => arr.filter((r) => r.type === t).reduce((s, r) => s + r.amount, 0);
  const opening = sumT(before, "KIRIM") - sumT(before, "CHIQIM");
  const inc = sumT(day, "KIRIM"), exp = sumT(day, "CHIQIM");
  const balance = opening + inc - exp;

  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/[\s,\u00a0\u202f]/g, " ");
  const safe = (s: unknown) =>
    String(s ?? "")
      .replace(/[’‘`ʼʻ]/g, "'")
      .replace(/[\u0400-\u04FF]/g, (c) => {
        const t = CYR[c.toLowerCase()] ?? "";
        return c === c.toLowerCase() ? t : t.charAt(0).toUpperCase() + t.slice(1);
      })
      .replace(/[^\x20-\x7E]/g, "");
  const dark = rgb(0.12, 0.16, 0.22), grey = rgb(0.45, 0.48, 0.52), green = rgb(0.05, 0.5, 0.3), red = rgb(0.75, 0.15, 0.15);
  const [y0, m0, d0] = date.split("-");
  const human = `${Number(d0)}-${UZ_MON_ORDER[Number(m0) - 1] ?? m0} ${y0}`;

  let page = pdf.addPage([595, 842]);
  let y = 800;
  const text = (t: string, x: number, o: { b?: boolean; s?: number; c?: any; right?: boolean } = {}) => {
    const f = o.b ? bold : font, s = o.s ?? 9, str = safe(t);
    const xx = o.right ? x - f.widthOfTextAtSize(str, s) : x;
    page.drawText(str, { x: xx, y, font: f, size: s, color: o.c ?? dark });
  };
  const fit = (t: string, w: number, s = 9) => {
    let str = safe(t);
    while (str.length > 1 && font.widthOfTextAtSize(str, s) > w) str = str.slice(0, -1);
    return str;
  };

  page.drawRectangle({ x: 0, y: 770, width: 595, height: 72, color: dark });
  page.drawText("PV OLG'A - KUNLIK KASSA HISOBOTI", { x: 40, y: 810, font: bold, size: 16, color: rgb(1, 1, 1) });
  page.drawText(safe(`Sana: ${human}   |   Manba: PV Olg'a naqd hisobot (Master_Data)`), { x: 40, y: 788, font, size: 10, color: rgb(0.85, 0.88, 0.92) });
  y = 740;

  const cards: [string, number, any][] = [
    ["Kun boshi qoldiq", opening, dark], ["Kirim", inc, green], ["Chiqim", exp, red], ["Kun oxiri qoldiq", balance, dark],
  ];
  cards.forEach(([label, val, c], i) => {
    const x = 40 + i * 131;
    page.drawRectangle({ x, y: y - 34, width: 123, height: 48, borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 1 });
    page.drawText(label, { x: x + 8, y: y, font, size: 8, color: grey });
    page.drawText(fmt(val), { x: x + 8, y: y - 22, font: bold, size: 12, color: c });
  });
  y -= 64;

  // Kategoriya bo'yicha
  const byCat = new Map<string, number>();
  const catLabel = new Map<string, string>();
  for (const r of day) {
    if (r.type !== "CHIQIM") continue;
    const raw = (r.cat || "Boshqa").trim(), key = raw.toLocaleLowerCase("uz");
    if (!catLabel.has(key)) catLabel.set(key, raw.charAt(0).toUpperCase() + raw.slice(1));
    const label = catLabel.get(key)!;
    byCat.set(label, (byCat.get(label) ?? 0) + r.amount);
  }
  if (byCat.size) {
    text("Chiqim kategoriyalar bo'yicha", 40, { b: true, s: 11 }); y -= 16;
    for (const [k, v] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
      const w = exp ? Math.max(2, (v / exp) * 250) : 0;
      text(k, 40); page.drawRectangle({ x: 170, y: y - 1, width: w, height: 8, color: rgb(0.3, 0.45, 0.7) });
      text(`${fmt(v)}  (${exp ? Math.round((v / exp) * 100) : 0}%)`, 555, { right: true });
      y -= 14;
    }
    y -= 10;
  }

  const cols = { n: 40, name: 62, cat: 250, qty: 345, price: 420, amt: 495, type: 555 };
  const header = () => {
    page.drawRectangle({ x: 36, y: y - 4, width: 523, height: 16, color: rgb(0.93, 0.94, 0.96) });
    text("#", cols.n, { b: true }); text("Nomi", cols.name, { b: true }); text("Kategoriya", cols.cat, { b: true });
    text("Soni", 380, { b: true, right: true }); text("Narx", 455, { b: true, right: true });
    text("Summa", 530, { b: true, right: true }); text("Tur", cols.type, { b: true, right: true });
    y -= 18;
  };
  text("Yozuvlar", 40, { b: true, s: 11 }); y -= 16;
  if (!day.length) { text("Bu kunda yozuv yo'q.", 40, { c: grey }); }
  else header();
  day.forEach((r, i) => {
    if (y < 50) { page = pdf.addPage([595, 842]); y = 800; header(); }
    text(String(i + 1), cols.n);
    page.drawText(fit(r.name, 180), { x: cols.name, y, font, size: 9, color: dark });
    page.drawText(fit(r.cat, 90), { x: cols.cat, y, font, size: 9, color: grey });
    text(r.qty ? String(r.qty) : "", 380, { right: true });
    text(r.price ? fmt(r.price) : "", 455, { right: true });
    text(fmt(r.amount), 530, { right: true, c: r.type === "KIRIM" ? green : dark });
    text(r.type === "KIRIM" ? "K" : "Ch", cols.type, { right: true, c: r.type === "KIRIM" ? green : red });
    y -= 13;
  });

  return { bytes: await pdf.save(), count: day.length, inc, exp, balance };
}

// ---------- Salyarka (yoqilg'i) jadvali ----------
// «PV olga Salyarka» jadvali, `Kirim-Chiqim` varag'i:
// Sana | Turi (KIRIM/CHIQIM) | Texnika | Haydovchi | Miqdor (l) | Izoh
const FUEL_SHEET_ID_DEFAULT = "1j6ukVhxgbBKc5InlRXVXGf373RoW_QaDdQl68ORVMV0";
const FUEL_TAB_DEFAULT = "Kirim-Chiqim";
const FUEL_HEADER = ["Sana", "Turi", "Texnika", "Haydovchi", "Miqdor (l)", "Izoh"];

export type FuelEntry = {
  date?: string | null;
  type?: string | null; // KIRIM | CHIQIM
  tech?: string | null;
  driver?: string | null;
  liters?: number | null;
  note?: string | null;
};

async function fuelTarget(): Promise<{ id: string; tab: string } | null> {
  const db = sb();
  const { data } = await db.from("app_settings").select("key,value")
    .in("key", ["fuel_sheet_enabled", "fuel_sheet_id", "fuel_sheet_tab"]);
  const cfg = Object.fromEntries(((data ?? []) as any[]).map((r) => [r.key, r.value])) as Record<string, string>;
  if (String(cfg["fuel_sheet_enabled"] ?? "true") === "false") return null;
  const id = cfg["fuel_sheet_id"] || FUEL_SHEET_ID_DEFAULT;
  const tab = cfg["fuel_sheet_tab"] || FUEL_TAB_DEFAULT;
  if (!id) return null;
  return { id, tab };
}

/** Salyarka yozuvlarini «PV olga Salyarka» jadvaliga qo'shadi. */
export async function appendFuelEntries(entries: FuelEntry[], dedupKey?: string): Promise<{ appended: number; error?: string }> {
  const rows = entries.filter((e) => Number(e.liters) > 0);
  if (!rows.length) return { appended: 0 };
  try {
    const t = await fuelTarget();
    if (!t) return { appended: 0 };
    await ensureTab(t.id, t.tab, FUEL_HEADER);
    await appendBotRows("fuel", t,
      rows.map((e) => [
        fmtDate(e.date) || fmtDate(new Date().toISOString()),
        String(e.type ?? "CHIQIM").toUpperCase() === "KIRIM" ? "KIRIM" : "CHIQIM",
        e.tech ?? "",
        e.driver ?? "",
        Number(e.liters) || 0,
        e.note ?? "",
      ]),
      6,
      dedupKey,
    );
    return { appended: rows.length };
  } catch (e: any) {
    return { appended: 0, error: String(e?.message ?? e) };
  }
}

let fuelCache: { at: number; rows: { row: number; date: string; type: string; tech: string; driver: string; lit: number; note: string }[] } | null = null;

/** «PV olga Salyarka» jadvalidan Fina uchun litr xulosasi + savolga mos qidiruv. 2 daqiqa keshlanadi. */
export async function getFuelContext(question?: string): Promise<string | null> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
  const t = await fuelTarget();
  if (!lovableKey || !sheetsKey || !t) return null;
  if (!fuelCache || Date.now() - fuelCache.at > 120000) {
    const res = await fetch(`${GATEWAY}/spreadsheets/${t.id}/values/${encodeURIComponent(t.tab)}!A:F?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`, {
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sheetsKey },
    });
    if (!res.ok) { console.error("fuel ctx read", res.status); return null; }
    const values = ((await res.json()).values ?? []) as any[][];
    const toNum = (v: any) => (typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".").replace(/[^\d.-]/g, "")) || 0);
    const toDate = (v: any): string => {
      if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
      const s = String(v ?? "").trim();
      const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
      if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
      return s.slice(0, 10);
    };
    const rows = values.map((r, i) => ({
      row: i + 1, date: toDate(r[0]), type: /kirim/i.test(String(r[1] ?? "")) ? "KIRIM" : "CHIQIM",
      tech: String(r[2] ?? "").trim(), driver: String(r[3] ?? "").trim(), lit: toNum(r[4]), note: String(r[5] ?? "").trim(),
    })).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.lit > 0);
    fuelCache = { at: Date.now(), rows };
  }
  const rows = fuelCache.rows;
  const f = (n: number) => (Math.round(n * 10) / 10).toLocaleString("ru-RU").replace(/[\s\u00a0\u202f]/g, " ");
  const sumT = (arr: typeof rows, ty: string) => arr.filter((r) => r.type === ty).reduce((s, r) => s + r.lit, 0);
  const group = (key: (r: (typeof rows)[number]) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.type === "CHIQIM") { const k = key(r) || "Noma'lum"; m.set(k, (m.get(k) ?? 0) + r.lit); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${f(v)} l`).join("; ");
  };
  const byDay = new Map<string, { i: number; e: number }>();
  for (const r of rows) { const d = byDay.get(r.date) ?? { i: 0, e: 0 }; if (r.type === "KIRIM") d.i += r.lit; else d.e += r.lit; byDay.set(r.date, d); }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 31);
  const line = (r: (typeof rows)[number]) => `#${r.row} | ${r.date} | ${r.type} | ${r.tech} | ${r.driver} | ${f(r.lit)} l${r.note ? ` | ${r.note}` : ""}`;

  let searchBlock = "";
  if (question?.trim()) {
    const { words, datePrefixes } = parseQuery(question);
    const skip = new Set(["salyarka", "solyarka", "dizel", "yoqilgi", "litr", "qancha", "necha", "ketdi", "quyildi", "sarf"].map(spellNorm));
    const ws = words.map(spellNorm).filter((w) => !skip.has(w));
    if (ws.length || datePrefixes.length) {
      const matchW = (r: (typeof rows)[number], list: string[]) => {
        const hay = spellNorm(`${r.tech} ${r.driver} ${r.note}`);
        return list.every((w) => hay.includes(w));
      };
      const inDate = (r: (typeof rows)[number]) => !datePrefixes.length || datePrefixes.some((p) => r.date.startsWith(p));
      let matched = rows.filter((r) => inDate(r) && matchW(r, ws));
      let note = "";
      if (!matched.length && ws.length > 1) {
        for (const w of ws) { const m = rows.filter((r) => inDate(r) && matchW(r, [w])); if (m.length) { matched = m; note = ` — faqat «${w}» bo'yicha`; break; } }
      }
      if (!matched.length && ws.length && datePrefixes.length) { matched = rows.filter(inDate); if (matched.length) note = " — nom topilmadi, davrdagi barcha yozuvlar"; }
      matched.sort((a, b) => b.date.localeCompare(a.date));
      searchBlock = matched.length
        ? [`\nSALYARKA QIDIRUV (kalit: ${[...ws, ...datePrefixes].join(", ")}${note}):`,
           `Topildi: ${matched.length} ta. JAMI CHIQIM (sarf): ${f(sumT(matched, "CHIQIM"))} l; JAMI KIRIM: ${f(sumT(matched, "KIRIM"))} l.`,
           matched.slice(0, 200).map(line).join("\n")].join("\n")
        : `\nSALYARKA QIDIRUV: mos yozuv topilmadi.`;
    }
  }
  const inc = sumT(rows, "KIRIM"), out = sumT(rows, "CHIQIM");
  return [
    `MANBA 2: «PV olga Salyarka» (${t.tab}) — faqat LITR, summa yo'q. Jami yozuv: ${rows.length}.`,
    `JAMI KIRIM: ${f(inc)} l; JAMI SARF: ${f(out)} l; OMBOR QOLDIQ: ${f(inc - out)} l.`,
    `TEXNIKA BO'YICHA SARF: ${group((r) => r.tech)}`,
    `HAYDOVCHI BO'YICHA SARF: ${group((r) => r.driver)}`,
    `OYLAR BO'YICHA SARF: ${group((r) => r.date.slice(0, 7))}`,
    `KUNLAR (sana: kirim/sarf l): ${days.map(([d, v]) => `${d}: ${f(v.i)}/${f(v.e)}`).join("; ")}`,
    searchBlock,
    `OXIRGI SALYARKA YOZUVLARI:\n${[...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(line).join("\n")}`,
  ].filter(Boolean).join("\n");
}


/** «PV olga Salyarka» jadvalidan kunlik litr hisoboti (PDF, summasiz). */
export async function buildFuelDayPdf(date: string): Promise<
  { bytes: Uint8Array; inLit: number; outLit: number; stock: number; count: number } | null
> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
  const t = await fuelTarget();
  if (!lovableKey || !sheetsKey || !t) return null;
  const res = await fetch(`${GATEWAY}/spreadsheets/${t.id}/values/${encodeURIComponent(t.tab)}!A:F?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`, {
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sheetsKey },
  });
  if (!res.ok) { console.error("fuel read", res.status, (await res.text()).slice(0, 300)); return null; }
  const values = ((await res.json()).values ?? []) as any[][];
  const toNum = (v: any) => (typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".").replace(/[^\d.-]/g, "")) || 0);
  const toDate = (v: any): string => {
    if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
    const s = String(v ?? "").trim();
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    return s.slice(0, 10);
  };
  const rows = values.map((r) => ({
    date: toDate(r[0]), type: /kirim/i.test(String(r[1] ?? "")) ? "KIRIM" : "CHIQIM",
    tech: String(r[2] ?? ""), driver: String(r[3] ?? ""), lit: toNum(r[4]), note: String(r[5] ?? ""),
  })).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.lit > 0);
  const sumT = (arr: typeof rows, ty: string) => arr.filter((r) => r.type === ty).reduce((s, r) => s + r.lit, 0);
  const before = rows.filter((r) => r.date < date);
  const day = rows.filter((r) => r.date === date);
  const opening = sumT(before, "KIRIM") - sumT(before, "CHIQIM");
  const inLit = sumT(day, "KIRIM"), outLit = sumT(day, "CHIQIM");
  const stock = opening + inLit - outLit;

  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString("ru-RU").replace(/[\s\u00a0\u202f]/g, " ");
  const safe = (s: unknown) => String(s ?? "").replace(/[’‘`ʼʻ]/g, "'")
    .replace(/[\u0400-\u04FF]/g, (c) => { const x = CYR[c.toLowerCase()] ?? ""; return c === c.toLowerCase() ? x : x.charAt(0).toUpperCase() + x.slice(1); })
    .replace(/[^\x20-\x7E]/g, "");
  const dark = rgb(0.12, 0.16, 0.22), grey = rgb(0.45, 0.48, 0.52), green = rgb(0.05, 0.5, 0.3), red = rgb(0.75, 0.15, 0.15), blue = rgb(0.13, 0.35, 0.65);
  const [y0, m0, d0] = date.split("-");
  const human = `${Number(d0)}-${UZ_MON_ORDER[Number(m0) - 1] ?? m0} ${y0}`;
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const text = (s: string, x: number, o: { b?: boolean; s?: number; c?: any; right?: boolean; w?: number } = {}) => {
    const f = o.b ? bold : font, sz = o.s ?? 9;
    let str = safe(s);
    if (o.w) while (str.length > 1 && f.widthOfTextAtSize(str, sz) > o.w) str = str.slice(0, -1);
    const xx = o.right ? x - f.widthOfTextAtSize(str, sz) : x;
    page.drawText(str, { x: xx, y, font: f, size: sz, color: o.c ?? dark });
  };
  page.drawRectangle({ x: 0, y: 770, width: 595, height: 72, color: dark });
  page.drawText("PV OLG'A - KUNLIK SALYARKA HISOBOTI", { x: 40, y: 810, font: bold, size: 16, color: rgb(1, 1, 1) });
  page.drawText(safe(`Sana: ${human}   |   Manba: PV olga Salyarka (${t.tab})   |   litr`), { x: 40, y: 788, font, size: 10, color: rgb(0.85, 0.88, 0.92) });
  y = 740;
  ([["Kun boshi qoldiq", opening, blue], ["Kirim (l)", inLit, green], ["Chiqim (l)", outLit, red], ["Kun oxiri qoldiq", stock, blue]] as [string, number, any][])
    .forEach(([label, val, c], i) => {
      const x = 40 + i * 131;
      page.drawRectangle({ x, y: y - 34, width: 123, height: 48, borderColor: c, borderWidth: 1 });
      page.drawCircle({ x: x + 11, y: y + 3, size: 3.5, color: c });
      page.drawText(label, { x: x + 18, y, font, size: 8, color: grey });
      page.drawText(`${fmt(val)} l`, { x: x + 8, y: y - 22, font: bold, size: 12, color: c });
    });
  y -= 64;
  const byTech = new Map<string, number>();
  for (const r of day) if (r.type === "CHIQIM") { const k = r.tech.trim() || "Boshqa"; byTech.set(k, (byTech.get(k) ?? 0) + r.lit); }
  if (byTech.size) {
    page.drawCircle({ x: 44, y: y + 3, size: 4, color: red });
    text("Texnika bo'yicha sarf", 54, { b: true, s: 11 }); y -= 16;
    for (const [k, v] of [...byTech.entries()].sort((a, b) => b[1] - a[1])) {
      text(k, 40, { w: 125 });
      page.drawRectangle({ x: 170, y: y - 1, width: outLit ? Math.max(2, (v / outLit) * 250) : 0, height: 8, color: rgb(0.85, 0.55, 0.15) });
      text(`${fmt(v)} l  (${outLit ? Math.round((v / outLit) * 100) : 0}%)`, 555, { right: true });
      y -= 14;
    }
    y -= 10;
  }
  const header = () => {
    page.drawRectangle({ x: 36, y: y - 4, width: 523, height: 16, color: rgb(0.93, 0.94, 0.96) });
    text("#", 40, { b: true }); text("Texnika", 62, { b: true }); text("Haydovchi", 210, { b: true });
    text("Izoh", 340, { b: true }); text("Litr", 512, { b: true, right: true }); text("Tur", 555, { b: true, right: true });
    y -= 18;
  };
  page.drawCircle({ x: 44, y: y + 3, size: 4, color: dark });
  text("Yozuvlar", 54, { b: true, s: 11 }); y -= 16;
  if (!day.length) text("Bu kunda yozuv yo'q.", 40, { c: grey }); else header();
  day.forEach((r, i) => {
    if (y < 50) { page = pdf.addPage([595, 842]); y = 800; header(); }
    const isK = r.type === "KIRIM";
    text(String(i + 1), 40); text(r.tech, 62, { w: 140 }); text(r.driver, 210, { w: 125, c: grey });
    text(r.note, 340, { w: 150, c: grey });
    text(fmt(r.lit), 512, { right: true, b: true, c: isK ? green : red });
    page.drawRectangle({ x: 520, y: y - 3, width: 39, height: 11, color: isK ? rgb(0.85, 0.93, 0.87) : rgb(0.96, 0.87, 0.87) });
    text(isK ? "KIRIM" : "CHIQIM", 554, { right: true, s: 7, b: true, c: isK ? green : red });
    y -= 13;
  });
  return { bytes: await pdf.save(), inLit, outLit, stock, count: day.length };
}

// ---------- HR (kadrlar) jadvali ----------
// «PV Olg'a HR» jadvali, `HR` varag'i:
// Sana | Turi (DAVOMAT/KELMADI/QABUL/CHIQDI/BOSHQA) | Xodim | Lavozim | Loyiha | Izoh
const HR_SHEET_ID_DEFAULT = "1YLyC4LzbunX1C6Bp1-pcu0lQslWRJ7HV3UKzDFxnRyg";
const HR_TAB_DEFAULT = "HR";
const HR_HEADER = ["Sana", "Turi", "Xodim", "Lavozim", "Loyiha", "Izoh"];

export type HrEntry = {
  date?: string | null;
  type?: string | null; // DAVOMAT | KELMADI | QABUL | CHIQDI | BOSHQA
  name?: string | null;
  role?: string | null;
  project?: string | null;
  note?: string | null;
};

export function normHrType(v: unknown): string {
  const s = spellNorm(String(v ?? ""));
  if (/qabul|ishga\s*ol|taklif/.test(s)) return "QABUL";
  if (/chiqdi|chiqar|ishdan\s*ket/.test(s)) return "CHIQDI";
  if (/kelmadi|sababli|sababsiz|kasal|ta\'?til|otpus/.test(s)) return "KELMADI";
  if (/davomat|keldi|ishda|bor/.test(s)) return "DAVOMAT";
  return "BOSHQA";
}

async function hrTarget(): Promise<{ id: string; tab: string } | null> {
  const db = sb();
  const { data } = await db.from("app_settings").select("key,value")
    .in("key", ["hr_sheet_enabled", "hr_sheet_id", "hr_sheet_tab"]);
  const cfg = Object.fromEntries(((data ?? []) as any[]).map((r) => [r.key, r.value])) as Record<string, string>;
  if (String(cfg["hr_sheet_enabled"] ?? "true") === "false") return null;
  const id = cfg["hr_sheet_id"] || HR_SHEET_ID_DEFAULT;
  const tab = cfg["hr_sheet_tab"] || HR_TAB_DEFAULT;
  if (!id) return null;
  return { id, tab };
}

/** HR yozuvlarini «PV Olg'a HR» jadvaliga qo'shadi. */
export async function appendHrEntries(entries: HrEntry[], dedupKey?: string): Promise<{ appended: number; error?: string }> {
  const rows = entries.filter((e) => String(e.name ?? "").trim());
  if (!rows.length) return { appended: 0 };
  try {
    const t = await hrTarget();
    if (!t) return { appended: 0 };
    await ensureTab(t.id, t.tab, HR_HEADER);
    await appendBotRows("hr", t,
      rows.map((e) => [
        fmtDate(e.date) || fmtDate(new Date().toISOString()),
        normHrType(e.type),
        String(e.name ?? "").trim(),
        e.role ?? "",
        e.project ?? "",
        e.note ?? "",
      ]),
      6,
      dedupKey,
    );
    return { appended: rows.length };
  } catch (e: any) {
    return { appended: 0, error: String(e?.message ?? e) };
  }
}

type HrRow = { row: number; date: string; type: string; name: string; role: string; project: string; note: string };

async function readHrRows(): Promise<HrRow[] | null> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
  const t = await hrTarget();
  if (!lovableKey || !sheetsKey || !t) return null;
  const res = await fetch(`${GATEWAY}/spreadsheets/${t.id}/values/${encodeURIComponent(t.tab)}!A:F?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`, {
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sheetsKey },
  });
  if (!res.ok) { console.error("hr read", res.status); return null; }
  const values = ((await res.json()).values ?? []) as any[][];
  const toDate = (v: any): string => {
    if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
    const s = String(v ?? "").trim();
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    return s.slice(0, 10);
  };
  return values.map((r, i) => ({
    row: i + 1, date: toDate(r[0]), type: normHrType(r[1]),
    name: String(r[2] ?? "").trim(), role: String(r[3] ?? "").trim(),
    project: String(r[4] ?? "").trim(), note: String(r[5] ?? "").trim(),
  })).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.name);
}

let hrCache: { at: number; rows: HrRow[] } | null = null;

/** «PV Olg'a HR» jadvalidan Fina uchun xulosa + savolga mos qidiruv. 2 daqiqa keshlanadi. */
export async function getHrContext(question?: string): Promise<string | null> {
  const t = await hrTarget();
  if (!t) return null;
  if (!hrCache || Date.now() - hrCache.at > 120000) {
    const rows = await readHrRows();
    if (!rows) return null;
    hrCache = { at: Date.now(), rows };
  }
  const rows = hrCache.rows;
  const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  const todayRows = rows.filter((r) => r.date === today);
  const count = (arr: HrRow[], ty: string) => arr.filter((r) => r.type === ty).length;
  const employees = new Map<string, string>();
  for (const r of rows) employees.set(spellNorm(r.name), r.name);
  const line = (r: HrRow) => `#${r.row} | ${r.date} | ${r.type} | ${r.name}${r.role ? ` | ${r.role}` : ""}${r.project ? ` | ${r.project}` : ""}${r.note ? ` | ${r.note}` : ""}`;

  let searchBlock = "";
  if (question?.trim()) {
    const { words, datePrefixes } = parseQuery(question);
    const skip = new Set(["hr", "davomat", "xodim", "xodimlar", "kadr", "kadrlar", "ishchi", "ishchilar", "qancha", "necha", "kim"].map(spellNorm));
    const ws = words.map(spellNorm).filter((w) => !skip.has(w));
    if (ws.length || datePrefixes.length) {
      const matchW = (r: HrRow, list: string[]) => {
        const hay = spellNorm(`${r.name} ${r.role} ${r.project} ${r.note} ${r.type}`);
        return list.every((w) => hay.includes(w));
      };
      const inDate = (r: HrRow) => !datePrefixes.length || datePrefixes.some((p) => r.date.startsWith(p));
      let matched = rows.filter((r) => inDate(r) && matchW(r, ws));
      let note = "";
      if (!matched.length && ws.length > 1) {
        for (const w of ws) { const m = rows.filter((r) => inDate(r) && matchW(r, [w])); if (m.length) { matched = m; note = ` — faqat «${w}» bo'yicha`; break; } }
      }
      if (!matched.length && ws.length && datePrefixes.length) { matched = rows.filter(inDate); if (matched.length) note = " — nom topilmadi, davrdagi barcha yozuvlar"; }
      matched.sort((a, b) => b.date.localeCompare(a.date));
      searchBlock = matched.length
        ? [`\nHR QIDIRUV (kalit: ${[...ws, ...datePrefixes].join(", ")}${note}):`,
           `Topildi: ${matched.length} ta.`,
           matched.slice(0, 200).map(line).join("\n")].join("\n")
        : `\nHR QIDIRUV: mos yozuv topilmadi.`;
    }
  }
  return [
    `MANBA 3: «PV Olg'a HR» (${t.tab}) — kadrlar/davomat. Jami yozuv: ${rows.length}; ro'yxatdagi xodimlar: ${employees.size}.`,
    `BUGUN (${today}): DAVOMAT ${count(todayRows, "DAVOMAT")}, KELMADI ${count(todayRows, "KELMADI")}, QABUL ${count(todayRows, "QABUL")}, CHIQDI ${count(todayRows, "CHIQDI")}.`,
    `XODIMLAR: ${[...employees.values()].slice(0, 120).join(", ")}`,
    searchBlock,
    `OXIRGI HR YOZUVLARI:\n${[...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(line).join("\n")}`,
  ].filter(Boolean).join("\n");
}

/** «PV Olg'a HR» jadvalidan kunlik davomat hisoboti (PDF). */
export async function buildHrDayPdf(date: string): Promise<
  { bytes: Uint8Array; present: number; absent: number; hired: number; left: number; count: number } | null
> {
  const rows = await readHrRows();
  if (!rows) return null;
  const day = rows.filter((r) => r.date === date);
  const cnt = (ty: string) => day.filter((r) => r.type === ty).length;
  const present = cnt("DAVOMAT"), absent = cnt("KELMADI"), hired = cnt("QABUL"), left = cnt("CHIQDI");

  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const safe = (s: unknown) => String(s ?? "").replace(/[’‘`ʼʻ]/g, "'")
    .replace(/[\u0400-\u04FF]/g, (c) => { const x = CYR[c.toLowerCase()] ?? ""; return c === c.toLowerCase() ? x : x.charAt(0).toUpperCase() + x.slice(1); })
    .replace(/[^\x20-\x7E]/g, "");
  const dark = rgb(0.12, 0.16, 0.22), grey = rgb(0.45, 0.48, 0.52), green = rgb(0.05, 0.5, 0.3), red = rgb(0.75, 0.15, 0.15), blue = rgb(0.13, 0.35, 0.65);
  const [y0, m0, d0] = date.split("-");
  const human = `${Number(d0)}-${UZ_MON_ORDER[Number(m0) - 1] ?? m0} ${y0}`;
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const text = (s: string, x: number, o: { b?: boolean; s?: number; c?: any; right?: boolean; w?: number } = {}) => {
    const f = o.b ? bold : font, sz = o.s ?? 9;
    let str = safe(s);
    if (o.w) while (str.length > 1 && f.widthOfTextAtSize(str, sz) > o.w) str = str.slice(0, -1);
    const xx = o.right ? x - f.widthOfTextAtSize(str, sz) : x;
    page.drawText(str, { x: xx, y, font: f, size: sz, color: o.c ?? dark });
  };
  page.drawRectangle({ x: 0, y: 770, width: 595, height: 72, color: dark });
  page.drawText("PV OLG'A - KUNLIK HR HISOBOTI", { x: 40, y: 810, font: bold, size: 16, color: rgb(1, 1, 1) });
  page.drawText(safe(`Sana: ${human}   |   Manba: PV Olg'a HR`), { x: 40, y: 788, font, size: 10, color: rgb(0.85, 0.88, 0.92) });
  y = 740;
  ([["Ishda (davomat)", present, green], ["Kelmadi", absent, red], ["Ishga qabul", hired, blue], ["Ishdan chiqdi", left, grey]] as [string, number, any][])
    .forEach(([label, val, c], i) => {
      const x = 40 + i * 131;
      page.drawRectangle({ x, y: y - 34, width: 123, height: 48, borderColor: c, borderWidth: 1 });
      page.drawCircle({ x: x + 11, y: y + 3, size: 3.5, color: c });
      page.drawText(label, { x: x + 18, y, font, size: 8, color: grey });
      page.drawText(String(val), { x: x + 8, y: y - 22, font: bold, size: 12, color: c });
    });
  y -= 64;
  const header = () => {
    page.drawRectangle({ x: 36, y: y - 4, width: 523, height: 16, color: rgb(0.93, 0.94, 0.96) });
    text("#", 40, { b: true }); text("Xodim", 62, { b: true }); text("Lavozim", 220, { b: true });
    text("Loyiha", 330, { b: true }); text("Izoh", 430, { b: true }); text("Tur", 555, { b: true, right: true });
    y -= 18;
  };
  page.drawCircle({ x: 44, y: y + 3, size: 4, color: dark });
  text("Yozuvlar", 54, { b: true, s: 11 }); y -= 16;
  if (!day.length) text("Bu kunda yozuv yo'q.", 40, { c: grey }); else header();
  day.forEach((r, i) => {
    if (y < 50) { page = pdf.addPage([595, 842]); y = 800; header(); }
    const c = r.type === "DAVOMAT" || r.type === "QABUL" ? green : r.type === "KELMADI" || r.type === "CHIQDI" ? red : grey;
    text(String(i + 1), 40); text(r.name, 62, { w: 150 }); text(r.role, 220, { w: 105, c: grey });
    text(r.project, 330, { w: 95, c: grey }); text(r.note, 430, { w: 90, c: grey });
    page.drawRectangle({ x: 505, y: y - 3, width: 54, height: 11, color: rgb(0.93, 0.94, 0.96) });
    text(r.type, 554, { right: true, s: 7, b: true, c });
    y -= 13;
  });
  return { bytes: await pdf.save(), present, absent, hired, left, count: day.length };
}

// ---------- DPR (kunlik ish hajmi) jadvali ----------
// «PV DPR» jadvali, `Daily_Log` varag'i:
// Sana | Yo'nalish | Blok № | Ish turi / Komponent | Bajarilgan hajm | O'lchov birligi | Izoh
const DPR_SHEET_ID_DEFAULT = "18dg-goglM4fH_1B0nShQi2Sdf0F47XXUJdsdR5VmoB8";
const DPR_TAB_DEFAULT = "Daily_Log";
const DPR_HEADER = ["Sana", "Yo'nalish", "Blok №", "Ish turi / Komponent", "Bajarilgan hajm", "O'lchov birligi", "Izoh"];

export type DprEntry = {
  date?: string | null;
  direction?: string | null; // Yo'nalish (Tracker, Blok va h.k.)
  block?: string | null;     // Blok №
  work?: string | null;      // Ish turi / Komponent
  qty?: number | null;       // Bajarilgan hajm
  unit?: string | null;      // O'lchov birligi
  note?: string | null;
};

async function dprTarget(): Promise<{ id: string; tab: string } | null> {
  const db = sb();
  const { data } = await db.from("app_settings").select("key,value")
    .in("key", ["dpr_sheet_enabled", "dpr_sheet_id", "dpr_sheet_tab"]);
  const cfg = Object.fromEntries(((data ?? []) as any[]).map((r) => [r.key, r.value])) as Record<string, string>;
  if (String(cfg["dpr_sheet_enabled"] ?? "true") === "false") return null;
  const id = cfg["dpr_sheet_id"] || DPR_SHEET_ID_DEFAULT;
  const tab = cfg["dpr_sheet_tab"] || DPR_TAB_DEFAULT;
  if (!id) return null;
  return { id, tab };
}

/** DPR yozuvlarini «PV DPR» jadvalining Daily_Log varag'iga qo'shadi. */
export async function appendDprEntries(entries: DprEntry[], dedupKey?: string): Promise<{ appended: number; error?: string }> {
  const rows = entries.filter((e) => String(e.work ?? "").trim() || String(e.direction ?? "").trim());
  if (!rows.length) return { appended: 0 };
  try {
    const t = await dprTarget();
    if (!t) return { appended: 0 };
    await ensureTab(t.id, t.tab, DPR_HEADER);
    await appendBotRows("dpr", t,
      rows.map((e) => [
        fmtDate(e.date) || fmtDate(new Date().toISOString()),
        String(e.direction ?? "").trim(),
        String(e.block ?? "").trim(),
        String(e.work ?? "").trim(),
        e.qty != null && Number.isFinite(Number(e.qty)) ? Number(e.qty) : "",
        String(e.unit ?? "").trim(),
        String(e.note ?? "").trim(),
      ]),
      7,
      dedupKey,
    );
    return { appended: rows.length };
  } catch (e: any) {
    return { appended: 0, error: String(e?.message ?? e) };
  }
}

type DprRow = { row: number; date: string; direction: string; block: string; work: string; qty: number; unit: string; note: string };

async function readDprRows(): Promise<DprRow[] | null> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
  const t = await dprTarget();
  if (!lovableKey || !sheetsKey || !t) return null;
  const res = await fetch(`${GATEWAY}/spreadsheets/${t.id}/values/${encodeURIComponent(t.tab)}!A:G?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`, {
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sheetsKey },
  });
  if (!res.ok) { console.error("dpr read", res.status); return null; }
  const values = ((await res.json()).values ?? []) as any[][];
  const toDate = (v: any): string => {
    if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
    const s = String(v ?? "").trim();
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    return s.slice(0, 10);
  };
  return values.map((r, i) => ({
    row: i + 1, date: toDate(r[0]),
    direction: String(r[1] ?? "").trim(), block: String(r[2] ?? "").trim(),
    work: String(r[3] ?? "").trim(), qty: Number(r[4]) || 0,
    unit: String(r[5] ?? "").trim(), note: String(r[6] ?? "").trim(),
  })).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && (r.work || r.direction) && r.row > 1);
}

let dprCache: { at: number; rows: DprRow[] } | null = null;

/** «PV DPR» jadvalidan Fina uchun xulosa + savolga mos qidiruv. 2 daqiqa keshlanadi. */
export async function getDprContext(question?: string): Promise<string | null> {
  const t = await dprTarget();
  if (!t) return null;
  if (!dprCache || Date.now() - dprCache.at > 120000) {
    const rows = await readDprRows();
    if (!rows) return null;
    dprCache = { at: Date.now(), rows };
  }
  const rows = dprCache.rows;
  const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  const todayRows = rows.filter((r) => r.date === today);
  const works = new Map<string, string>();
  for (const r of rows) if (r.work) works.set(spellNorm(r.work), r.work);
  const line = (r: DprRow) => `#${r.row} | ${r.date} | ${r.direction}${r.block ? ` | Blok ${r.block}` : ""} | ${r.work} | ${r.qty} ${r.unit}${r.note ? ` | ${r.note}` : ""}`;

  let searchBlock = "";
  if (question?.trim()) {
    const { words, datePrefixes } = parseQuery(question);
    const skip = new Set(["dpr", "ish", "hajm", "hajmi", "bajarilgan", "qancha", "necha", "kunlik", "reja"].map(spellNorm));
    const ws = words.map(spellNorm).filter((w) => !skip.has(w));
    if (ws.length || datePrefixes.length) {
      const matchW = (r: DprRow, list: string[]) => {
        const hay = spellNorm(`${r.direction} ${r.block} ${r.work} ${r.unit} ${r.note}`);
        return list.every((w) => hay.includes(w));
      };
      const inDate = (r: DprRow) => !datePrefixes.length || datePrefixes.some((p) => r.date.startsWith(p));
      let matched = rows.filter((r) => inDate(r) && matchW(r, ws));
      let note = "";
      if (!matched.length && ws.length > 1) {
        for (const w of ws) { const m = rows.filter((r) => inDate(r) && matchW(r, [w])); if (m.length) { matched = m; note = ` — faqat «${w}» bo'yicha`; break; } }
      }
      if (!matched.length && ws.length && datePrefixes.length) { matched = rows.filter(inDate); if (matched.length) note = " — kalit topilmadi, davrdagi barcha yozuvlar"; }
      matched.sort((a, b) => b.date.localeCompare(a.date));
      searchBlock = matched.length
        ? [`\nDPR QIDIRUV (kalit: ${[...ws, ...datePrefixes].join(", ")}${note}):`,
           `Topildi: ${matched.length} ta.`,
           matched.slice(0, 200).map(line).join("\n")].join("\n")
        : `\nDPR QIDIRUV: mos yozuv topilmadi.`;
    }
  }
  return [
    `MANBA 4: «PV DPR» (${t.tab}) — kunlik bajarilgan ish hajmlari (pul emas, hajm/birliklarda). Jami yozuv: ${rows.length}.`,
    `BUGUN (${today}): ${todayRows.length} ta yozuv.`,
    `ISH TURLARI: ${[...works.values()].slice(0, 80).join(", ")}`,
    searchBlock,
    `OXIRGI DPR YOZUVLARI:\n${[...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(line).join("\n")}`,
  ].filter(Boolean).join("\n");
}

/** «PV DPR» jadvalidan kunlik ish hajmi hisoboti (PDF). */
export async function buildDprDayPdf(date: string): Promise<
  { bytes: Uint8Array; count: number; byWork: [string, number, string][] } | null
> {
  const rows = await readDprRows();
  if (!rows) return null;
  const day = rows.filter((r) => r.date === date);
  const agg = new Map<string, { qty: number; unit: string }>();
  for (const r of day) {
    const k = r.work || "Boshqa";
    const cur = agg.get(k) ?? { qty: 0, unit: r.unit };
    cur.qty += r.qty; if (!cur.unit && r.unit) cur.unit = r.unit;
    agg.set(k, cur);
  }
  const byWork: [string, number, string][] = [...agg.entries()].map(([w, v]) => [w, v.qty, v.unit] as [string, number, string])
    .sort((a, b) => b[1] - a[1]);

  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const safe = (s: unknown) => String(s ?? "").replace(/[’‘`ʼʻ]/g, "'")
    .replace(/[\u0400-\u04FF]/g, (c) => { const x = CYR[c.toLowerCase()] ?? ""; return c === c.toLowerCase() ? x : x.charAt(0).toUpperCase() + x.slice(1); })
    .replace(/[^\x20-\x7E]/g, "");
  const dark = rgb(0.12, 0.16, 0.22), grey = rgb(0.45, 0.48, 0.52), green = rgb(0.05, 0.5, 0.3), blue = rgb(0.13, 0.35, 0.65);
  const [y0, m0, d0] = date.split("-");
  const human = `${Number(d0)}-${UZ_MON_ORDER[Number(m0) - 1] ?? m0} ${y0}`;
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const text = (s: string, x: number, o: { b?: boolean; s?: number; c?: any; right?: boolean; w?: number } = {}) => {
    const f = o.b ? bold : font, sz = o.s ?? 9;
    let str = safe(s);
    if (o.w) while (str.length > 1 && f.widthOfTextAtSize(str, sz) > o.w) str = str.slice(0, -1);
    const xx = o.right ? x - f.widthOfTextAtSize(str, sz) : x;
    page.drawText(str, { x: xx, y, font: f, size: sz, color: o.c ?? dark });
  };
  page.drawRectangle({ x: 0, y: 770, width: 595, height: 72, color: dark });
  page.drawText("PV OLG'A - KUNLIK DPR (ISH HAJMI)", { x: 40, y: 810, font: bold, size: 15, color: rgb(1, 1, 1) });
  page.drawText(safe(`Sana: ${human}   |   Manba: PV DPR / Daily_Log`), { x: 40, y: 788, font, size: 10, color: rgb(0.85, 0.88, 0.92) });
  y = 740;
  page.drawRectangle({ x: 40, y: y - 34, width: 240, height: 48, borderColor: blue, borderWidth: 1 });
  page.drawText("Yozuvlar soni", { x: 52, y, font, size: 8, color: grey });
  page.drawText(String(day.length), { x: 52, y: y - 22, font: bold, size: 12, color: blue });
  page.drawRectangle({ x: 296, y: y - 34, width: 240, height: 48, borderColor: green, borderWidth: 1 });
  page.drawText("Ish turlari", { x: 308, y, font, size: 8, color: grey });
  page.drawText(String(byWork.length), { x: 308, y: y - 22, font: bold, size: 12, color: green });
  y -= 64;
  // Ish turlari bo'yicha jamlanma
  page.drawCircle({ x: 44, y: y + 3, size: 4, color: dark });
  text("Ish turlari bo'yicha jami", 54, { b: true, s: 11 }); y -= 16;
  if (!byWork.length) text("Bu kunda yozuv yo'q.", 40, { c: grey });
  else {
    page.drawRectangle({ x: 36, y: y - 4, width: 523, height: 16, color: rgb(0.93, 0.94, 0.96) });
    text("Ish turi / Komponent", 40, { b: true }); text("Jami hajm", 555, { b: true, right: true }); y -= 18;
    for (const [w, q, u] of byWork) {
      if (y < 50) { page = pdf.addPage([595, 842]); y = 800; }
      text(w, 40, { w: 400 });
      text(`${(Math.round(q * 100) / 100).toLocaleString("en-US")} ${u}`.trim(), 555, { right: true, b: true, c: blue });
      y -= 13;
    }
  }
  y -= 10;
  // Batafsil yozuvlar
  page.drawCircle({ x: 44, y: y + 3, size: 4, color: dark });
  text("Yozuvlar", 54, { b: true, s: 11 }); y -= 16;
  if (day.length) {
    page.drawRectangle({ x: 36, y: y - 4, width: 523, height: 16, color: rgb(0.93, 0.94, 0.96) });
    text("#", 40, { b: true }); text("Yo'nalish", 62, { b: true }); text("Blok", 150, { b: true });
    text("Ish turi", 190, { b: true }); text("Hajm", 555, { b: true, right: true }); y -= 18;
    day.forEach((r, i) => {
      if (y < 50) { page = pdf.addPage([595, 842]); y = 800; }
      text(String(i + 1), 40); text(r.direction, 62, { w: 85 }); text(r.block, 150, { w: 35, c: grey });
      text(r.work, 190, { w: 270 }); text(`${r.qty} ${r.unit}`.trim(), 555, { right: true, c: blue });
      y -= 13;
    });
  }
  return { bytes: await pdf.save(), count: day.length, byWork };
}

/** Hisobot turi: salyarka / dpr / hr / naqd (default). */
export function detectReportKind(q: string): "fuel" | "dpr" | "hr" | "cash" {
  const low = spellNorm(q);
  if (/s[ao]l[iy]?[ae]?rka|solyarka|diz[ae]l|yoqilg/.test(low)) return "fuel";
  if (/\bdpr\b|ish\s*hajmi|bajarilgan\s*ish/.test(low)) return "dpr";
  if (/\bhr\b|davomat|xodimlar\s*hisobot|kadr/.test(low)) return "hr";
  return "cash";
}

// ---------- Sheet'ni oxirgi holatida Excel (.xlsx) qilib berish ----------
export function detectExcelRequest(q: string): "cash" | "fuel" | "hr" | "dpr" | null {
  const s = q.toLowerCase();
  if (!/(excel|exel|eksel|xlsx|эксель|ексел)/i.test(s)) return null;
  if (/(salyarka|solyarka|dizel|yoqilg|litr)/i.test(s)) return "fuel";
  if (/(\bhr\b|davomat|xodim|kadr|ishchi)/i.test(s)) return "hr";
  if (/(\bdpr\b|ish\s*hajm|bajarilgan\s*ish|daily)/i.test(s)) return "dpr";
  return "cash";
}

export async function buildSheetExcel(kind: "cash" | "fuel" | "hr" | "dpr"): Promise<{ bytes: Uint8Array; filename: string; rows: number } | null> {
  const XLSX = await import("xlsx");
  const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  if (kind === "cash") {
    sheetRowsCache = null; // eng so'nggi holat
    const d = await loadSheetRows();
    if (!d) return null;
    const aoa: any[][] = [["#", "Sana", "Nomi", "Kategoriya", "Miqdor", "Narx", "Summa", "Mas'ul", "Turi"]];
    for (const r of d.rows) aoa.push([r.row, r.date, r.name, r.cat, r.qty || "", r.price || "", r.amount, r.who, r.type]);
    const inc = d.rows.filter((r) => r.type === "KIRIM").reduce((a, r) => a + r.amount, 0);
    const exp = d.rows.filter((r) => r.type === "CHIQIM").reduce((a, r) => a + r.amount, 0);
    aoa.push([], ["", "", "Jami kirim", "", "", "", inc], ["", "", "Jami chiqim", "", "", "", exp], ["", "", "Qoldiq", "", "", "", inc - exp]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [6, 12, 34, 18, 9, 12, 14, 16, 9].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kassa");
    return { bytes: new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), filename: `Kassa_hisoboti_${today}.xlsx`, rows: d.rows.length };
  }
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (kind === "hr") {
    const t = await hrTarget();
    if (!lovableKey || !sheetsKey || !t) return null;
    const res = await fetch(`${GATEWAY}/spreadsheets/${t.id}/values/${encodeURIComponent(t.tab)}!A:F`, {
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sheetsKey },
    });
    if (!res.ok) { console.error("hr excel read", res.status); return null; }
    const values = ((await res.json()).values ?? []) as any[][];
    const ws = XLSX.utils.aoa_to_sheet(values.length ? values : [HR_HEADER]);
    ws["!cols"] = [12, 12, 22, 16, 16, 30].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "HR");
    return { bytes: new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), filename: `HR_${today}.xlsx`, rows: Math.max(0, values.length - 1) };
  }
  if (kind === "dpr") {
    const t = await dprTarget();
    if (!lovableKey || !sheetsKey || !t) return null;
    const res = await fetch(`${GATEWAY}/spreadsheets/${t.id}/values/${encodeURIComponent(t.tab)}!A:G`, {
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sheetsKey },
    });
    if (!res.ok) { console.error("dpr excel read", res.status); return null; }
    const values = ((await res.json()).values ?? []) as any[][];
    const ws = XLSX.utils.aoa_to_sheet(values.length ? values : [DPR_HEADER]);
    ws["!cols"] = [12, 14, 8, 34, 14, 12, 30].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily_Log");
    return { bytes: new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), filename: `DPR_${today}.xlsx`, rows: Math.max(0, values.length - 1) };
  }
  const t = await fuelTarget();
  if (!lovableKey || !sheetsKey || !t) return null;
  const res = await fetch(`${GATEWAY}/spreadsheets/${t.id}/values/${encodeURIComponent(t.tab)}!A:F`, {
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sheetsKey },
  });
  if (!res.ok) { console.error("fuel excel read", res.status); return null; }
  const values = ((await res.json()).values ?? []) as any[][];
  const ws = XLSX.utils.aoa_to_sheet(values.length ? values : [["Sana", "Turi", "Texnika", "Haydovchi", "Miqdor (l)", "Izoh"]]);
  ws["!cols"] = [12, 10, 20, 18, 12, 30].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Salyarka");
  return { bytes: new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), filename: `Salyarka_${today}.xlsx`, rows: Math.max(0, values.length - 1) };
}
