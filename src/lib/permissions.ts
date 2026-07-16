// Markaziy rol va ruxsat moduli.
// Yangi 10 ta rol tizimi. Eski rollar (project_manager, snabjenec, ...) ko'chirilgan
// va bu yerda ko'rsatilmaydi.

export type AppRole =
  | "admin"
  | "ceo"
  | "direktor"
  | "finans"
  | "buxgalter"
  | "pm"
  | "prorab"
  | "taminotchi"
  | "omborchi"
  | "kuzatuvchi";

export const ALL_ROLES: AppRole[] = [
  "admin",
  "ceo",
  "direktor",
  "finans",
  "buxgalter",
  "pm",
  "prorab",
  "taminotchi",
  "omborchi",
  "kuzatuvchi",
];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  ceo: "CEO",
  direktor: "Direktor",
  finans: "Finans",
  buxgalter: "Buxgalter",
  pm: "PM (loyiha boshqaruvchisi)",
  prorab: "Prorab",
  taminotchi: "Ta'minotchi",
  omborchi: "Omborchi",
  kuzatuvchi: "Kuzatuvchi",
};

// Sahifa → unga kira oladigan rollar.
// Admin har doim hammasini ko'radi (kod tomonida `has('admin')` tekshiriladi).
export const PAGE_PERMISSIONS: Record<string, AppRole[]> = {
  "/":                ["admin", "ceo", "finans", "pm"],
  "/master-zayavka":  ["admin", "ceo", "direktor", "pm", "taminotchi", "kuzatuvchi"],
  "/master-jadval":   ["admin", "ceo", "direktor", "pm", "prorab", "kuzatuvchi"],
  
  "/taminot":         ["admin", "ceo", "direktor", "pm", "taminotchi", "omborchi"],
  "/buxalteriya":     ["admin", "ceo", "direktor", "finans", "buxgalter"],
  "/brigade-balance": ["admin", "ceo", "direktor", "finans", "buxgalter", "pm", "prorab"],
  "/davomat":         ["admin", "ceo", "direktor", "pm", "prorab"],
  "/variations":      ["admin", "ceo", "direktor", "pm"],
  "/audit-log":       ["admin", "ceo", "direktor"],
  "/ai-agent":        ["admin", "ceo", "direktor", "pm"],
  "/settings":        ["admin", "finans"],
};

// Bu rollar tizimdagi BARCHA loyiha va firmalarni ko'radi.
// Qolganlar faqat user_project_access / user_firm_access dagi yozuvlari bo'yicha ko'radi.
export const SEE_ALL_SCOPE: AppRole[] = ["admin", "ceo", "direktor", "finans"];

export function isAppRole(r: string): r is AppRole {
  return (ALL_ROLES as string[]).includes(r);
}

export function hasAnyRole(userRoles: string[], allowed: AppRole[]): boolean {
  if (userRoles.includes("admin")) return true;
  return allowed.some((r) => userRoles.includes(r));
}

export function canAccessPath(
  pathname: string,
  userRoles: string[],
  matrix: Record<string, AppRole[]> = PAGE_PERMISSIONS,
): boolean {
  if (userRoles.includes("admin")) return true;
  const exact = matrix[pathname];
  if (exact) return hasAnyRole(userRoles, exact);
  const keys = Object.keys(matrix)
    .filter((k) => k !== "/" && pathname.startsWith(k + "/"))
    .sort((a, b) => b.length - a.length);
  if (keys.length > 0) return hasAnyRole(userRoles, matrix[keys[0]]);
  return true;
}

/** Tahrirlash uchun barcha boshqariladigan sahifalar ro'yxati va Uzbek nomlari. */
export const MANAGED_PAGES: Array<{ path: string; label: string }> = [
  { path: "/",                label: "Dashboard" },
  { path: "/master-zayavka",  label: "Smeta (B.O.Q)" },
  { path: "/master-jadval",   label: "Jurnal" },
  
  { path: "/taminot",         label: "Ta'minot" },
  { path: "/buxalteriya",     label: "Buxgalteriya" },
  { path: "/brigade-balance", label: "Xodimlar / Brigada balansi" },
  { path: "/davomat",         label: "Davomat" },
  { path: "/variations",      label: "Qo'shimcha ishlar" },
  { path: "/audit-log",       label: "Audit log" },
  { path: "/ai-agent",        label: "AI agent" },
  { path: "/settings",        label: "Sozlamalar" },
];

export function seesAllScope(userRoles: string[]): boolean {
  return hasAnyRole(userRoles, SEE_ALL_SCOPE);
}
