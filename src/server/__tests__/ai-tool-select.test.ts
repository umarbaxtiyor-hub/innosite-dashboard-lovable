import { describe, it, expect } from "vitest";
import { selectToolNames, TOOL_TIER, ORG_ONLY_TOOLS, recentUserText } from "../../../supabase/functions/ai-agent/tool-select";

const CORE = ["list_projects", "get_project", "get_summary", "get_expenses", "get_incomes", "get_boq", "get_recent_activity", "global_finance"];

describe("ai-agent tool selection", () => {
  it("covers all 21 tools", () => expect(Object.keys(TOOL_TIER)).toHaveLength(21));

  it("CEO/finance generic question → only core", () => {
    expect(selectToolNames({ text: "Loyiha qoldig'i qancha?", projectScoped: false }).sort()).toEqual([...CORE].sort());
  });

  it("finance HR question adds HR tools", () => {
    const t = selectToolNames({ text: "xodimlarga oylik qancha to'landi", projectScoped: false });
    expect(t).toContain("get_employees");
    expect(t).toContain("get_employee_payments");
    expect(t).not.toContain("get_suppliers");
  });

  it("PM never receives ORG_ONLY tools, even when asked", () => {
    const t = selectToolNames({ text: "xodim oylik brigada supplier firma katalog", projectScoped: true });
    for (const n of ORG_ONLY_TOOLS) expect(t).not.toContain(n);
    expect(t).toContain("get_work_progress");
    expect(t).toContain("get_summary");
  });

  it("zayavka/warehouse specialists only on topic", () => {
    expect(selectToolNames({ text: "zayavka holati", projectScoped: true })).toContain("get_zayavka_workflow");
    expect(selectToolNames({ text: "nakladnoy keldi?", projectScoped: true })).toContain("get_warehouse_receipts");
  });

  it("follow-up keeps topic from previous user message", () => {
    const txt = recentUserText([{ role: "user", content: "brigadalar balansi" }, { role: "assistant", content: "..." }, { role: "user", content: "eng kattasi?" }]);
    expect(selectToolNames({ text: txt, projectScoped: false })).toContain("get_brigades");
  });
});
