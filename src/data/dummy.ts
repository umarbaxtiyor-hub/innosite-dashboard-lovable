// Dummy data for the Construction Project Control Dashboard.
// Structure mirrors what a real backend (e.g. Lovable Cloud / Supabase) would
// return so swapping these arrays for fetched data is straightforward.

export type BOQItem = {
  code: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  plannedCost: number;
  actualCost: number;
  category: string;
};

export type Material = {
  id: string;
  boqCode: string;
  name: string;
  unit: string;
  qtyPlanned: number;
  qtyUsed: number;
  unitCost: number;
  supplier: string;
};

export type WorkProgress = {
  id: string;
  boqCode: string;
  task: string;
  progress: number; // 0-100
  startDate: string;
  endDate: string;
  status: "On Track" | "Delayed" | "Completed";
};

export type Expense = {
  id: string;
  boqCode: string;
  date: string;
  category: string;
  description: string;
  amount: number;
};

export type Variation = {
  id: string;
  boqCode: string;
  title: string;
  amount: number;
  requestedBy: string;
  date: string;
  status: "Pending" | "Approved" | "Rejected";
};

export const boqItems: BOQItem[] = [
  { code: "BOQ-001", description: "Site clearance & excavation", unit: "m³", qty: 1200, rate: 25, plannedCost: 30000, actualCost: 31500, category: "Earthworks" },
  { code: "BOQ-002", description: "Reinforced concrete foundation", unit: "m³", qty: 450, rate: 320, plannedCost: 144000, actualCost: 162000, category: "Concrete" },
  { code: "BOQ-003", description: "Structural steel framing", unit: "ton", qty: 85, rate: 1850, plannedCost: 157250, actualCost: 175400, category: "Steel" },
  { code: "BOQ-004", description: "Block masonry walls", unit: "m²", qty: 2400, rate: 42, plannedCost: 100800, actualCost: 103000, category: "Masonry" },
  { code: "BOQ-005", description: "Internal & external plastering", unit: "m²", qty: 4800, rate: 18, plannedCost: 86400, actualCost: 84200, category: "Finishes" },
  { code: "BOQ-006", description: "Floor tiling — porcelain", unit: "m²", qty: 1800, rate: 55, plannedCost: 99000, actualCost: 112800, category: "Finishes" },
  { code: "BOQ-007", description: "Electrical rough-in & DBs", unit: "ls", qty: 1, rate: 78000, plannedCost: 78000, actualCost: 80500, category: "MEP" },
  { code: "BOQ-008", description: "Plumbing & sanitary fittings", unit: "ls", qty: 1, rate: 65000, plannedCost: 65000, actualCost: 71500, category: "MEP" },
  { code: "BOQ-009", description: "HVAC ducting & equipment", unit: "ls", qty: 1, rate: 142000, plannedCost: 142000, actualCost: 138000, category: "MEP" },
  { code: "BOQ-010", description: "Painting & decoration", unit: "m²", qty: 6200, rate: 12, plannedCost: 74400, actualCost: 70100, category: "Finishes" },
  { code: "BOQ-011", description: "Aluminium windows & glazing", unit: "m²", qty: 480, rate: 240, plannedCost: 115200, actualCost: 128400, category: "Joinery" },
  { code: "BOQ-012", description: "Roofing & waterproofing", unit: "m²", qty: 950, rate: 95, plannedCost: 90250, actualCost: 92800, category: "Envelope" },
];

export const materials: Material[] = [
  { id: "M-01", boqCode: "BOQ-002", name: "OPC Cement 50kg", unit: "bag", qtyPlanned: 4200, qtyUsed: 4480, unitCost: 8.5, supplier: "Holcim" },
  { id: "M-02", boqCode: "BOQ-002", name: "Aggregate 20mm", unit: "m³", qtyPlanned: 380, qtyUsed: 395, unitCost: 28, supplier: "Pioneer" },
  { id: "M-03", boqCode: "BOQ-003", name: "Steel rebar 16mm", unit: "ton", qtyPlanned: 62, qtyUsed: 68, unitCost: 920, supplier: "ArcelorMittal" },
  { id: "M-04", boqCode: "BOQ-004", name: "Hollow block 200mm", unit: "pcs", qtyPlanned: 18000, qtyUsed: 18450, unitCost: 1.6, supplier: "BlockCo" },
  { id: "M-05", boqCode: "BOQ-006", name: "Porcelain tile 600x600", unit: "m²", qtyPlanned: 1800, qtyUsed: 1920, unitCost: 22, supplier: "Porcelanosa" },
  { id: "M-06", boqCode: "BOQ-010", name: "Emulsion paint", unit: "L", qtyPlanned: 1240, qtyUsed: 1180, unitCost: 6.4, supplier: "Jotun" },
  { id: "M-07", boqCode: "BOQ-011", name: "Aluminium profile", unit: "m", qtyPlanned: 2200, qtyUsed: 2310, unitCost: 14, supplier: "Alupco" },
  { id: "M-08", boqCode: "BOQ-012", name: "Bituminous membrane", unit: "m²", qtyPlanned: 950, qtyUsed: 980, unitCost: 12, supplier: "Sika" },
];

export const workProgress: WorkProgress[] = [
  { id: "W-01", boqCode: "BOQ-001", task: "Site clearance & excavation", progress: 100, startDate: "2026-01-08", endDate: "2026-01-28", status: "Completed" },
  { id: "W-02", boqCode: "BOQ-002", task: "Foundation concrete pour", progress: 100, startDate: "2026-01-30", endDate: "2026-02-25", status: "Completed" },
  { id: "W-03", boqCode: "BOQ-003", task: "Structural steel erection", progress: 82, startDate: "2026-02-20", endDate: "2026-04-10", status: "On Track" },
  { id: "W-04", boqCode: "BOQ-004", task: "Block masonry — Levels 1-3", progress: 65, startDate: "2026-03-05", endDate: "2026-04-30", status: "On Track" },
  { id: "W-05", boqCode: "BOQ-005", task: "Plastering works", progress: 40, startDate: "2026-03-25", endDate: "2026-05-20", status: "Delayed" },
  { id: "W-06", boqCode: "BOQ-007", task: "Electrical rough-in", progress: 55, startDate: "2026-03-15", endDate: "2026-05-10", status: "On Track" },
  { id: "W-07", boqCode: "BOQ-008", task: "Plumbing first fix", progress: 48, startDate: "2026-03-20", endDate: "2026-05-15", status: "Delayed" },
  { id: "W-08", boqCode: "BOQ-012", task: "Roof waterproofing", progress: 20, startDate: "2026-04-15", endDate: "2026-05-30", status: "On Track" },
];

export const expenses: Expense[] = [
  { id: "E-01", boqCode: "BOQ-002", date: "2026-05-01", category: "Material", description: "Cement delivery batch #42", amount: 3820 },
  { id: "E-02", boqCode: "BOQ-003", date: "2026-05-01", category: "Labor", description: "Steel erection crew — week 17", amount: 5400 },
  { id: "E-03", boqCode: "BOQ-006", date: "2026-05-02", category: "Material", description: "Porcelain tile shipment", amount: 6120 },
  { id: "E-04", boqCode: "BOQ-007", date: "2026-05-02", category: "Equipment", description: "Cable pulling tools rental", amount: 480 },
  { id: "E-05", boqCode: "BOQ-004", date: "2026-05-03", category: "Labor", description: "Masonry crew daywork", amount: 2960 },
  { id: "E-06", boqCode: "BOQ-005", date: "2026-05-03", category: "Material", description: "Plaster sand & cement", amount: 1840 },
  { id: "E-07", boqCode: "BOQ-008", date: "2026-04-30", category: "Material", description: "PEX piping & fittings", amount: 2240 },
  { id: "E-08", boqCode: "BOQ-009", date: "2026-04-29", category: "Equipment", description: "HVAC AHU mobilization", amount: 4800 },
];

export const monthlyExpenses = [
  { month: "Nov", amount: 48000 },
  { month: "Dec", amount: 76000 },
  { month: "Jan", amount: 142000 },
  { month: "Feb", amount: 198000 },
  { month: "Mar", amount: 245000 },
  { month: "Apr", amount: 287000 },
  { month: "May", amount: 132000 },
];

export const variations: Variation[] = [
  { id: "VR-001", boqCode: "BOQ-002", title: "Increase footing depth — soil report", amount: 18000, requestedBy: "Eng. Karim", date: "2026-02-10", status: "Approved" },
  { id: "VR-002", boqCode: "BOQ-006", title: "Upgrade to imported porcelain", amount: 13800, requestedBy: "Client", date: "2026-03-22", status: "Approved" },
  { id: "VR-003", boqCode: "BOQ-011", title: "Switch to triple-glazed units", amount: 13200, requestedBy: "Architect", date: "2026-04-05", status: "Pending" },
  { id: "VR-004", boqCode: "BOQ-009", title: "Add heat recovery unit", amount: 9600, requestedBy: "MEP Consultant", date: "2026-04-18", status: "Pending" },
  { id: "VR-005", boqCode: "BOQ-010", title: "Premium anti-bacterial paint", amount: 4200, requestedBy: "Client", date: "2026-04-22", status: "Rejected" },
  { id: "VR-006", boqCode: "BOQ-003", title: "Additional bracing — wind load", amount: 18150, requestedBy: "Structural Eng.", date: "2026-04-28", status: "Pending" },
];

// ---------- Derived analytics ----------

export const totalBudget = boqItems.reduce((s, i) => s + i.plannedCost, 0);
export const totalActual = boqItems.reduce((s, i) => s + i.actualCost, 0);
export const difference = totalActual - totalBudget;
export const differencePct = (difference / totalBudget) * 100;
export const profitLoss = -difference; // simplified: under-budget = profit

export const materialPlannedTotal = materials.reduce((s, m) => s + m.qtyPlanned * m.unitCost, 0);
export const materialActualTotal = materials.reduce((s, m) => s + m.qtyUsed * m.unitCost, 0);
export const materialVariance = materialActualTotal - materialPlannedTotal;

export const overallProgress = Math.round(
  workProgress.reduce((s, w) => s + w.progress, 0) / workProgress.length
);

export const pendingApprovals = variations.filter((v) => v.status === "Pending").length;

export const dailyExpenses = (() => {
  const today = expenses.reduce((max, e) => (e.date > max ? e.date : max), expenses[0].date);
  return expenses.filter((e) => e.date === today).reduce((s, e) => s + e.amount, 0);
})();

export const monthlyExpensesTotal = monthlyExpenses[monthlyExpenses.length - 1].amount;

export const costByCategory = (() => {
  const map = new Map<string, number>();
  boqItems.forEach((i) => map.set(i.category, (map.get(i.category) ?? 0) + i.actualCost));
  return Array.from(map, ([name, value]) => ({ name, value }));
})();

export const topOverspending = boqItems
  .map((i) => ({ code: i.code, overspend: i.actualCost - i.plannedCost, pct: ((i.actualCost - i.plannedCost) / i.plannedCost) * 100 }))
  .filter((i) => i.overspend > 0)
  .sort((a, b) => b.overspend - a.overspend)
  .slice(0, 5);

export const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export const variancePct = (planned: number, actual: number) => ((actual - planned) / planned) * 100;

export const varianceLevel = (pct: number): "ok" | "warn" | "critical" => {
  if (pct > 10) return "critical";
  if (pct > 5) return "warn";
  return "ok";
};
