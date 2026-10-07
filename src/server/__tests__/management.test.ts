import { describe, it, expect } from "vitest";
import { buildCategoryIndex, resolveSheetCategory } from "@/lib/sheet-category";
import { computeInsights, partitionNew, syncHealth, fingerprint, type ProjectInput } from "@/lib/insights-rules";

const sourceKey = (s: string, r: string) => `${s}:${r}`;

describe("identity = source UUID only", () => {
  it("same business values + different UUID = 2 distinct keys", () => {
    const a = { date: "2026-10-01", amount: 1000, category: "Ijara" };
    const b = { ...a };
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(sourceKey("expenses", "11111111-1111-1111-1111-111111111111")).not.toBe(sourceKey("expenses", "22222222-2222-2222-2222-222222222222"));
  });
  it("same UUID update = same key (same row)", () => {
    expect(sourceKey("expenses", "x")).toBe(sourceKey("expenses", "x"));
  });
});

describe("category mapping", () => {
  const idx = buildCategoryIndex([
    { kind: "expense", source_category: "Kanselyariya", sheet_category: "Ofis" },
    { kind: "income", source_category: "Avans", sheet_category: "Buyurtmachi avansi" },
    { kind: "expense", source_category: "Eski", sheet_category: "X", active: false },
  ]);
  it("admin map wins (case-insensitive)", () => {
    expect(resolveSheetCategory(idx, "expense", " kanselyariya ", "")).toEqual({ category: "Ofis", via: "map", warning: null });
  });
  it("income mapped separately", () => {
    expect(resolveSheetCategory(idx, "income", "Avans", "").category).toBe("Buyurtmachi avansi");
    expect(resolveSheetCategory(idx, "expense", "Avans", "").category).toBe("Usta");
  });
  it("keyword rule fallback", () => {
    expect(resolveSheetCategory(idx, "expense", "x", "salyarka 50l").category).toBe("Yoqilg‘i");
  });
  it("unknown category = warning + safe Boshqa", () => {
    const r = resolveSheetCategory(idx, "expense", "Eski", "zzz");
    expect(r.category).toBe("Boshqa");
    expect(r.warning).toMatch(/Noma'lum/);
  });
});

const base: ProjectInput = {
  id: "p1", name: "P", total_budget: 1000, start_date: "2026-01-01", end_date: "2026-12-31",
  boq_planned: 1000, boq_actual: 100, expense_total: 1200, income_total: 500,
  expenses_30d: [], fuel_7d: 0, fuel_prev28d: 0, attendance_7d_days: 0, employees_active: 0,
  dpr_last_date: null, zayavka_overdue: 0, zayavka_pending_old: 0,
};

describe("insights", () => {
  it("detects budget overrun, delay, cashflow from real inputs", () => {
    const keys = computeInsights([base], "2026-10-07").map((i) => i.rule_key);
    expect(keys).toEqual(expect.arrayContaining(["budget_overrun", "schedule_delay", "cashflow_risk"]));
  });
  it("no data = no fake insights", () => {
    const quiet = { ...base, expense_total: 0, income_total: 0, boq_planned: 0, total_budget: 0 };
    expect(computeInsights([quiet], "2026-10-07")).toEqual([]);
  });
  it("alerts don't duplicate", () => {
    const a = computeInsights([base], "2026-10-07");
    const b = computeInsights([base], "2026-10-08");
    const first = partitionNew(a, new Set());
    const second = partitionNew(b, new Set(first.fresh.map((i) => i.fingerprint)));
    expect(second.fresh.filter((i) => i.rule_key === "schedule_delay")).toHaveLength(0);
    expect(partitionNew([...a, ...a], new Set()).fresh).toHaveLength(a.length);
    expect(fingerprint("r", "p", "w")).toBe(fingerprint("r", "p", "w"));
  });
});

describe("sync health", () => {
  it("classifies", () => {
    expect(syncHealth({ failed: 0, stuck: 0, pending: 0, duplicates: 0, warnings: 0 })).toBe("healthy");
    expect(syncHealth({ failed: 1, stuck: 0, pending: 0, duplicates: 0, warnings: 0 })).toBe("attention");
    expect(syncHealth({ failed: 0, stuck: 0, pending: 0, duplicates: 1, warnings: 0 })).toBe("critical");
  });
});

describe("HSE/QAQC from real DPR issues", () => {
  it("flags only matching issue text", async () => {
    const { computeInsights, classifyIssue } = await import("@/lib/insights-rules");
    const p = { ...base, expense_total: 0, income_total: 0, boq_planned: 0, total_budget: 0, issues_7d: [{ date: "2026-10-06", text: "Ishchi jarohat oldi" }, { date: "2026-10-06", text: "Beton kechikdi" }] };
    const r = computeInsights([p], "2026-10-07");
    expect(r.map((i) => i.rule_key)).toEqual(["hse_issue"]);
    expect(r[0].severity).toBe("critical");
    expect(classifyIssue("devorda yoriq")).toBe("qaqc");
  });
});
