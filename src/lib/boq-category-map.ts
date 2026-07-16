// Xarajat kategoriyasi <-> BOQ kategoriyasi bog'lash mantiqi.
// Loyihaning Smeta (BOQ) jadvalidagi qaysi yozuvlar bilan ushbu xarajat
// turi mos kelishini aniqlaydi. Faqat 8 ta asosiy xarajat kategoriyasi
// qo'llab-quvvatlanadi.

export const EXPENSE_CATEGORIES = [
  "Material (BOQ)",
  "Ish (BOQ)",
  "Qo'shimcha (BOQ)",
  "Bozorlik",
  "Transport",
  "Yordamchi",
  "Xodimlar",
  "Boshqa",
] as const;

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
