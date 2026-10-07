// Xarajat kategoriyasi <-> BOQ kategoriyasi bog'lash mantiqi.
// Loyihaning Smeta (BOQ) jadvalidagi qaysi yozuvlar bilan ushbu xarajat
// turi mos kelishini aniqlaydi. Faqat 8 ta asosiy xarajat kategoriyasi
// qo'llab-quvvatlanadi.

export const EXPENSE_CATEGORIES = [
  "Qurilish materiali",
  "Oziq-ovqat",
  "Benzin",
  "Salyarka",
  "Texnika",
  "Ofis/Lager",
  "Oylik",
  "Avans",
  "Boshqa",
] as const;

// Kirim kategoriyalari — faqat shu uchtasi
export const INCOME_CATEGORIES = ["Naqd", "Bank", "Shartnoma"] as const;

// Xarajat "turi" (kind) — jurnal yagona ma'lumot bazasi bo'lishi uchun.
// Har bir xarajat qaysi turga mansubligini aniqlaydi.
export const EXPENSE_KINDS = [
  "boq_material",
  "boq_work",
  "ustalar",
  "xodim",
  "yoqilgi",
  "operatsion",
] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

export const EXPENSE_KIND_LABELS: Record<ExpenseKind, string> = {
  boq_material: "Material (BOQ)",
  boq_work: "Ish (BOQ)",
  ustalar: "Ustalar",
  xodim: "Xodimlar",
  yoqilgi: "Yoqilg'i",
  operatsion: "Operatsion",
};

// BOQ (smeta) bandiga bog'lanishi shart bo'lgan turlar.
// Bu turlarda pul sarflanganda smeta ro'yxatidan band tanlanadi,
// hajm kiritiladi va smetadagi foiz avtomatik yuradi.
export function kindNeedsBoq(kind: ExpenseKind | string | null | undefined): boolean {
  return kind === "boq_material" || kind === "boq_work" || kind === "ustalar";
}

// Tur uchun standart kategoriya (kategoriya majburiy maydon).
export function defaultCategoryForKind(kind: ExpenseKind, all: string[]): string {
  const pick = (keys: string[]) =>
    all.find((c) => keys.some((k) => c.toLowerCase().includes(k)));
  switch (kind) {
    case "boq_material": return pick(["material"]) ?? "Qurilish materiali";
    case "boq_work": return pick(["ish"]) ?? "Ish";
    case "ustalar": return pick(["avans"]) ?? "Avans";
    case "xodim": return pick(["oylik"]) ?? "Oylik";
    case "yoqilgi": return pick(["benzin", "salyarka"]) ?? "Benzin";
    default: return pick(["boshqa"]) ?? all[0] ?? "Boshqa";
  }
}

// Tur bo'yicha BOQ nomzodlari (material turlari / ish turlari).
export function boqCandidatesForKind(kind: ExpenseKind | string, boq: BoqLite[]): BoqLite[] {
  if (!kindNeedsBoq(kind)) return [];
  const isWork = kind === "boq_work" || kind === "ustalar";
  const matched = boq.filter((b) => {
    const x = (b.category ?? "").toLowerCase();
    if (!x) return true;
    return isWork ? /ish|work|usta|labor|labour/.test(x) : /material|mater|materyal|qurilish/.test(x);
  });
  return matched.length ? matched : boq;
}

// Tur <-> kategoriya bog'lash: tanlangan turga mos kategoriyalarni qaytaradi.
export function categoriesForKind(kind: ExpenseKind, all: string[]): string[] {
  const lower = (s: string) => (s ?? "").toLowerCase();
  const matches = (s: string, keys: string[]) => keys.some((k) => lower(s).includes(k));
  const res = all.filter((c) => {
    const x = lower(c);
    switch (kind) {
      case "boq_material":
        return matches(c, ["material"]); // Qurilish materiali
      case "boq_work":
        return matches(c, ["ish"]);
      case "ustalar":
        return matches(c, ["avans"]);
      case "xodim":
        return matches(c, ["oylik"]);
      case "yoqilgi":
        return matches(c, ["benzin", "salyarka"]);
      case "operatsion":
        return !matches(c, ["oylik", "avans", "material", "benzin", "salyarka"]);
      default:
        return false;
    }
  });
  if (res.length) return res;
  const fb = defaultCategoryForKind(kind, all);
  return fb ? [fb] : [];
}


// Kategoriya nomidan uning turini (kind) aniqlash.
export function kindForCategory(cat: string | null | undefined): ExpenseKind {
  const c = (cat ?? "").toLowerCase();
  if (c.includes("(boq)")) return c.includes("ish") ? "boq_work" : "boq_material";
  if (c.includes("oylik")) return "xodim";
  if (c.includes("avans")) return "ustalar";
  if (c.includes("benzin") || c.includes("salyarka")) return "yoqilgi";
  if (c.includes("material")) return "boq_material";
  if (c.startsWith("ish")) return "boq_work";
  if (c.includes("usta") || c.includes("brigada")) return "ustalar";
  if (c.includes("xodim")) return "xodim";
  return "operatsion";
}

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// Xarajat kategoriyasiga BOQ kodi biriktirish kerakmi?
export function categoryNeedsBoq(cat: string): boolean {
  const c = (cat ?? "").toLowerCase();
  return c.includes("(boq)") || c.includes("material") || c.startsWith("ish") || c.includes("qo'shimcha") || c.includes("qoshimcha");
}

// boq_items ichidan ushbu xarajat kategoriyasiga mos yozuvlarni filtrlash.
// boq_items.category dala qiymati erkin matn (Material/Ish/Work/...) bo'lishi mumkin.
export function boqCategoryFilter(expenseCategory: string): (boqCategory: string | null | undefined) => boolean {
  const c = (expenseCategory ?? "").toLowerCase();

  if (c.includes("material")) {
    return (b) => {
      const x = (b ?? "").toLowerCase();
      return !x || /material|mater|materyal|qurilish/.test(x);
    };
  }
  if (c.startsWith("ish") || c.includes("(boq)") && c.includes("ish")) {
    return (b) => {
      const x = (b ?? "").toLowerCase();
      return !x || /ish|work|labor|labour/.test(x);
    };
  }
  if (c.includes("qo'shimcha") || c.includes("qoshimcha") || c.includes("qo`shimcha")) {
    return (b) => {
      const x = (b ?? "").toLowerCase();
      return !x || /qo.?shimcha|extra|additional|variation|varyatsiya/.test(x);
    };
  }
  // Boshqa kategoriyalar BOQga bog'lanmaydi.
  return () => false;
}

export type BoqLite = { id: string; code: string; description: string | null; category: string | null };

// Loyiha BOQ ro'yxatidan xarajat kategoriyasiga mos kodlarni qaytarish.
// Mos topilmasa, foydalanuvchi tanlay olishi uchun BOQga tegishli kategoriyalarda
// barcha BOQ kodlarini qaytaradi.
export function boqCandidatesFor(expenseCategory: string, boq: BoqLite[]): BoqLite[] {
  if (!categoryNeedsBoq(expenseCategory)) return [];
  const filter = boqCategoryFilter(expenseCategory);
  const matched = boq.filter((b) => filter(b.category));
  return matched.length ? matched : boq;
}

// Tavsif (description) bo'yicha eng yaxshi BOQ kodini topishga urinish.
// Oddiy substring/word taqqoslash — to'liq mos kelmasa null.
export function autoMatchBoqByText(description: string | null | undefined, candidates: BoqLite[]): BoqLite | null {
  const d = (description ?? "").trim().toLowerCase();
  if (!d || candidates.length === 0) return null;
  const words = d.split(/\s+/).filter((w) => w.length >= 3);
  let best: { item: BoqLite; score: number } | null = null;
  for (const b of candidates) {
    const t = `${b.description ?? ""} ${b.code ?? ""}`.toLowerCase();
    if (!t.trim()) continue;
    let score = 0;
    if (t.includes(d)) score += 10;
    for (const w of words) if (t.includes(w)) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { item: b, score };
  }
  return best && best.score >= 2 ? best.item : null;
}

// Jurnal qatori material_receipts ga takror yozilganmi?
// BOQ ga bog'langan xarajatlar smeta fakti uchun material_receipts yoki
// work_progress ga ham yoziladi. Chiqim hisobida material qabullari alohida
// qo'shilgani uchun faqat material nusxasi chiqarib tashlanadi; ish nusxasi
// (work_progress) pul chiqimi emas, shuning uchun jurnal qatori qoladi.
export function isMaterialMirrorExpense(row: { source?: string | null; kind?: string | null }): boolean {
  const s = String(row?.source ?? "");
  if (s === "web_boq_mat") return true;
  if (s !== "web_boq") return false;
  const k = String(row?.kind ?? "");
  return k !== "boq_work" && k !== "ustalar";
}
