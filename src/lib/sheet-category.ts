// Innosite kategoriyasi → Google Sheets kategoriyasi. Toza (pure) funksiyalar — testlanadi.
// Tartib: 1) admin boshqaradigan sheet_category_map, 2) kalit so'z qoidalari, 3) xavfsiz "Boshqa" + ogohlantirish.

export type CategoryMapRow = { kind: "expense" | "income"; source_category: string; sheet_category: string; active?: boolean };
export type ResolvedCategory = { category: string; via: "map" | "rule" | "fallback" | "raw"; warning: string | null };

const key = (s: unknown) => String(s ?? "").trim().toLocaleLowerCase("uz");

export function ruleSheetCategory(category: unknown, description: unknown): string | null {
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
  return null;
}

export function buildCategoryIndex(rows: CategoryMapRow[]) {
  const idx = { expense: new Map<string, string>(), income: new Map<string, string>() };
  for (const r of rows) if (r.active !== false && r.source_category?.trim()) idx[r.kind].set(key(r.source_category), r.sheet_category);
  return idx;
}
export type CategoryIndex = ReturnType<typeof buildCategoryIndex>;

export function resolveSheetCategory(idx: CategoryIndex, kind: "expense" | "income", category: unknown, description: unknown): ResolvedCategory {
  const mapped = idx[kind].get(key(category));
  if (mapped) return { category: mapped, via: "map", warning: null };
  if (kind === "income") {
    const raw = String(category ?? "").trim();
    return raw ? { category: raw, via: "raw", warning: null } : { category: "Kirim", via: "fallback", warning: "Kirim kategoriyasi bo'sh" };
  }
  const rule = ruleSheetCategory(category, description);
  if (rule) return { category: rule, via: "rule", warning: null };
  return { category: "Boshqa", via: "fallback", warning: `Noma'lum kategoriya «${String(category ?? "").slice(0, 60)}» → «Boshqa»` };
}
