// AI agent tool tanlash — pure (Deno va vitest ikkalasida ishlaydi).
// Modelga har so'rovda faqat kerakli tool ta'riflari yuboriladi; runTool barcha 21 tasini
// bajarishda davom etadi (xavfsizlik runTool ichida: ORG_ONLY + loyiha doirasi).

export type ToolTier = "core" | "specialist" | "rare";

export const ORG_ONLY_TOOLS = new Set([
  "list_firms", "get_brigades", "get_brigade_detail", "get_employees", "get_employee_payments",
  "get_suppliers", "get_supplier_contracts", "global_finance", "search_master",
]);

export const TOOL_TIER: Record<string, ToolTier> = {
  list_projects: "core", get_project: "core", get_summary: "core", get_expenses: "core",
  get_incomes: "core", get_boq: "core", get_recent_activity: "core", global_finance: "core",
  get_work_progress: "specialist", get_warehouse_receipts: "specialist",
  get_master_zayavka: "specialist", get_zayavka_workflow: "specialist",
  get_brigades: "specialist", get_brigade_detail: "specialist",
  get_employees: "specialist", get_employee_payments: "specialist",
  get_suppliers: "specialist", get_supplier_contracts: "specialist",
  get_variations: "rare", list_firms: "rare", search_master: "rare",
};

// Mavzu → tool guruhi (specialist/rare faqat kalit so'z bo'lsa yuboriladi).
const TOPICS: { re: RegExp; tools: string[] }[] = [
  { re: /xodim|oylik|avans|ish ?haq|maosh|hr\b|davomat|employee|salary|ishchi/i, tools: ["get_employees", "get_employee_payments"] },
  { re: /brigad|usta|bajarilgan ish|ish hajm|work|progress|bajaril/i, tools: ["get_brigades", "get_brigade_detail", "get_work_progress"] },
  { re: /supplier|yetkazib|ta'minotchi|taminotchi|postavshik|shartnoma|kontrakt|contract/i, tools: ["get_suppliers", "get_supplier_contracts"] },
  { re: /ombor|sklad|nakladnoy|qabul|warehouse|receipt|material kel/i, tools: ["get_warehouse_receipts"] },
  { re: /zayavka|buyurtma|ta'minot|procurement|xarid|so'rov|reja qator/i, tools: ["get_master_zayavka", "get_zayavka_workflow"] },
  { re: /variation|qo'shimcha ish|o'zgartirish/i, tools: ["get_variations"] },
  { re: /firma|kompaniya|firm/i, tools: ["list_firms"] },
  { re: /katalog|master ?katalog|narx(lar)? ro'yxat/i, tools: ["search_master"] },
];

export function selectToolNames(opts: { text: string; projectScoped: boolean }): string[] {
  const picked = new Set(Object.keys(TOOL_TIER).filter((n) => TOOL_TIER[n] === "core"));
  for (const t of TOPICS) if (t.re.test(opts.text)) t.tools.forEach((n) => picked.add(n));
  if (opts.projectScoped) for (const n of ORG_ONLY_TOOLS) picked.delete(n);
  return Object.keys(TOOL_TIER).filter((n) => picked.has(n));
}

// Oxirgi 2 ta foydalanuvchi xabari (follow-up savollar mavzuni saqlashi uchun).
export function recentUserText(messages: { role?: string; content?: unknown }[]): string {
  return messages.filter((m) => m?.role !== "assistant").slice(-2).map((m) => String(m?.content ?? "")).join("\n").slice(0, 8000);
}
