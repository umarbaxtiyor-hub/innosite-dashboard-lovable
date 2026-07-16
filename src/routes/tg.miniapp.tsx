import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/tg/miniapp")({
  head: () => ({
    meta: [
      { title: "Kunlik hisobot — Innosite" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
    ],
    scripts: [{ src: "https://telegram.org/js/telegram-web-app.js" }],
  }),
  component: MiniApp,
});

type Kind = "material" | "work" | "expense" | "brigade_pay";
type Row = {
  kind: Kind;
  name: string;
  unit: string;
  qty: string;
  unit_price: string;
  amount: string;
  master_id: string | null;
  brigade_id: string | null;
  brigade: string;
  supplier: string;
  category: string;
  payment_method: string;
  kind_pay: string;
  note: string;
};

const emptyRow = (kind: Kind = "material"): Row => ({
  kind,
  name: "",
  unit: "",
  qty: "",
  unit_price: "",
  amount: "",
  master_id: null,
  brigade_id: null,
  brigade: "",
  supplier: "",
  category: "Boshqa",
  payment_method: "Naqd",
  kind_pay: "avans",
  note: "",
});

const KIND_LABEL: Record<Kind, string> = {
  material: "📦 Material",
  work: "🔨 Ish",
  expense: "💰 Xarajat",
  brigade_pay: "💵 To'lov",
};

const fmt = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString("uz-UZ") : "—";

const STORAGE_KEY = "innosite-tg-theme";
type Theme = "light" | "dark";

// Brand palette
const NAVY = "#0F172A";
const ORANGE = "#F97316";

function MiniApp() {
  const [tg, setTg] = useState<any>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [meta, setMeta] = useState<{
    materials: { id: string; name: string; unit: string }[];
    works: { id: string; name: string; unit: string }[];
    brigades: { id: string; name: string }[];
    projects: { id: string; name: string; code?: string }[];
    session: any;
  } | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    try {
      const saved = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "light";
      setTheme(saved);
    } catch {}
  }, []);

  useEffect(() => {
    const w = window as any;
    const t = w.Telegram?.WebApp;
    if (t) {
      t.ready();
      t.expand();
      setTg(t);
    }
    const initData = t?.initData || "";
    if (!initData) {
      setMsg("Bu sahifa faqat Telegram ichida ochilishi kerak");
      return;
    }
    fetch(`/api/public/tg-meta?initData=${encodeURIComponent(initData)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((m) => {
        setMeta(m);
        if (m.session?.project_id) setProjectId(m.session.project_id);
        else if (m.projects?.[0]) setProjectId(m.projects[0].id);
      })
      .catch((e) => setMsg(`Yuklash xatosi: ${e.message}`));
  }, []);

  const totalOf = (r: Row): number => {
    if (r.kind === "material" || r.kind === "work")
      return (Number(r.qty) || 0) * (Number(r.unit_price) || 0);
    return Number(r.amount) || 0;
  };
  const grand = useMemo(() => rows.reduce((s, r) => s + totalOf(r), 0), [rows]);

  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows((rs) => [...rs, emptyRow(rs[rs.length - 1]?.kind ?? "material")]);
  const removeRow = (i: number) => setRows((rs) => (rs.length === 1 ? [emptyRow()] : rs.filter((_, idx) => idx !== i)));

  const onPickMaster = (i: number, masterId: string) => {
    if (!meta) return;
    const r = rows[i];
    const list = r.kind === "work" ? meta.works : meta.materials;
    const m = list.find((x) => x.id === masterId);
    if (!m) return;
    updateRow(i, { master_id: m.id, name: m.name, unit: m.unit });
  };
  const onPickBrigade = (i: number, bid: string) => {
    if (!meta) return;
    const b = meta.brigades.find((x) => x.id === bid);
    updateRow(i, { brigade_id: b?.id ?? null, brigade: b?.name ?? "" });
  };

  const toggleTheme = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  };

  async function submit() {
    if (!tg) { setMsg("Telegramda oching"); return; }
    if (!projectId) { setMsg("Loyiha tanlang"); return; }
    const cleanRows = rows
      .map((r) => ({
        kind: r.kind,
        date,
        master_id: r.master_id,
        name: r.name.trim(),
        unit: r.unit.trim(),
        qty: Number(r.qty) || 0,
        unit_price: Number(r.unit_price) || 0,
        amount: Number(r.amount) || 0,
        brigade_id: r.brigade_id,
        brigade: r.brigade.trim() || null,
        supplier: r.supplier.trim() || null,
        category: r.category,
        description: r.kind === "expense" ? r.name.trim() : undefined,
        payment_method: r.payment_method,
        paid_by: r.kind === "expense" ? r.supplier.trim() || null : null,
        kind_pay: r.kind_pay,
        note: r.note.trim() || null,
      }))
      .filter((r) =>
        r.kind === "material" || r.kind === "work"
          ? r.name && r.qty > 0
          : r.amount > 0
      );

    if (!cleanRows.length) { setMsg("Hech bo'lmasa bitta to'liq satr kerak"); return; }

    setSubmitting(true);
    setMsg("");
    try {
      const res = await fetch("/api/public/tg-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg.initData, project_id: projectId, rows: cleanRows }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "xato");
      tg.showPopup?.({
        title: "Saqlandi ✅",
        message: `${j.ok} ta yozuv qo'shildi${j.errors?.length ? `, ${j.errors.length} xato` : ""}`,
        buttons: [{ type: "ok" }],
      });
      tg.close?.();
    } catch (e: any) {
      setMsg("Xato: " + (e?.message ?? "noma'lum"));
    } finally {
      setSubmitting(false);
    }
  }

  // Theme tokens
  const t = theme === "light"
    ? { bg: "#F8FAFC", fg: NAVY, sub: "#475569", card: "#FFFFFF", border: "#E2E8F0", input: "#FFFFFF", inputBorder: "#E2E8F0", chipBg: "#EEF2F7", chipFg: NAVY, sumBg: "#FFF7ED", sumBorder: ORANGE }
    : { bg: NAVY, fg: "#F8FAFC", sub: "#94A3B8", card: "#1E293B", border: "#334155", input: "#0F172A", inputBorder: "#334155", chipBg: "#0F172A", chipFg: "#F8FAFC", sumBg: "#1E293B", sumBorder: ORANGE };

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: `1px solid ${t.inputBorder}`, borderRadius: 8,
    marginTop: 4, marginBottom: 6, boxSizing: "border-box",
    background: t.input, color: t.fg,
    fontFamily: "Manrope, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  };
  const card: React.CSSProperties = {
    border: `2px solid ${ORANGE}`,
    borderRadius: 14, padding: 12, marginBottom: 12,
    background: t.card,
    boxShadow: theme === "light" ? "0 1px 2px rgba(15,23,42,0.04)" : "none",
  };
  const chip = (active: boolean): React.CSSProperties => ({
    padding: "7px 11px", borderRadius: 999, border: "none",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
    background: active ? ORANGE : t.chipBg,
    color: active ? "#FFFFFF" : t.chipFg,
  });
  const btn: React.CSSProperties = {
    width: "100%", padding: "13px", fontSize: 15, fontWeight: 700,
    border: "none", borderRadius: 10, cursor: "pointer",
    fontFamily: "Manrope, system-ui, sans-serif",
  };

  if (!meta) {
    return <div style={{ padding: 20, background: t.bg, color: t.fg, minHeight: "100vh", fontFamily: "Manrope, system-ui, sans-serif" }}>Yuklanmoqda...</div>;
  }

  return (
    <div style={{
      padding: 14, maxWidth: 720, margin: "0 auto", paddingBottom: 100,
      background: t.bg, color: t.fg, minHeight: "100vh",
      fontFamily: "Manrope, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    }}>
      {/* Brand header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "2px 0 14px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 0, fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" }}>
          <span>inn</span>
          <span style={{ color: ORANGE }}>o</span>
          <span>site</span>
          <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, color: t.sub, letterSpacing: 0 }}>Kunlik hisobot</span>
        </div>
        <button
          onClick={toggleTheme}
          aria-label="Tema"
          style={{
            border: `1px solid ${t.border}`, background: t.card, color: t.fg,
            width: 34, height: 34, borderRadius: 8, cursor: "pointer", fontSize: 16,
          }}
        >
          {theme === "light" ? "🌙" : "☀️"}
        </button>
      </div>

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ fontSize: 12, color: t.sub, fontWeight: 600 }}>
            Loyiha
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inp}>
              <option value="">— tanlang —</option>
              {meta.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: t.sub, fontWeight: 600 }}>
            Sana
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
          </label>
        </div>
      </div>

      {rows.map((r, i) => (
        <div key={i} style={card}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {(["material", "work", "expense", "brigade_pay"] as Kind[]).map((k) => (
              <button key={k} onClick={() => updateRow(i, { kind: k, master_id: null, name: "" })} style={chip(r.kind === k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
            <button
              onClick={() => removeRow(i)}
              style={{ ...chip(false), marginLeft: "auto", background: theme === "light" ? "#FEE2E2" : "#3B1818", color: "#DC2626" }}
            >
              ✕
            </button>
          </div>

          {(r.kind === "material" || r.kind === "work") && (
            <>
              <select value={r.master_id ?? ""} onChange={(e) => onPickMaster(i, e.target.value)} style={inp}>
                <option value="">— katalogdan tanlash —</option>
                {(r.kind === "material" ? meta.materials : meta.works).map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                ))}
              </select>
              <input placeholder="yoki nomini yozing" value={r.name} onChange={(e) => updateRow(i, { name: e.target.value, master_id: null })} style={inp} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                <input placeholder="Hajm" inputMode="decimal" value={r.qty} onChange={(e) => updateRow(i, { qty: e.target.value })} style={inp} />
                <input placeholder="Birlik" value={r.unit} onChange={(e) => updateRow(i, { unit: e.target.value })} style={inp} />
                <input placeholder="Narx" inputMode="decimal" value={r.unit_price} onChange={(e) => updateRow(i, { unit_price: e.target.value })} style={inp} />
              </div>
              {r.kind === "material" ? (
                <input placeholder="Ta'minotchi" value={r.supplier} onChange={(e) => updateRow(i, { supplier: e.target.value })} style={inp} />
              ) : (
                <select value={r.brigade_id ?? ""} onChange={(e) => onPickBrigade(i, e.target.value)} style={inp}>
                  <option value="">— brigada tanlash —</option>
                  {meta.brigades.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </>
          )}

          {r.kind === "expense" && (
            <>
              <input placeholder="Tavsif (masalan: Yo'l puli)" value={r.name} onChange={(e) => updateRow(i, { name: e.target.value })} style={inp} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <select value={r.category} onChange={(e) => updateRow(i, { category: e.target.value })} style={inp}>
                  {["Bozorlik", "Transport", "Yordamchi", "Xodimlar", "Boshqa"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}

                </select>
                <select value={r.payment_method} onChange={(e) => updateRow(i, { payment_method: e.target.value })} style={inp}>
                  {["Naqd", "Plastik", "O'tkazma", "Hisob"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <input placeholder="Summa" inputMode="decimal" value={r.amount} onChange={(e) => updateRow(i, { amount: e.target.value })} style={inp} />
              <input placeholder="Kim to'ladi (ixtiyoriy)" value={r.supplier} onChange={(e) => updateRow(i, { supplier: e.target.value })} style={inp} />
            </>
          )}

          {r.kind === "brigade_pay" && (
            <>
              <select value={r.brigade_id ?? ""} onChange={(e) => onPickBrigade(i, e.target.value)} style={inp}>
                <option value="">— brigada tanlash —</option>
                {meta.brigades.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <input placeholder="yoki yangi brigada nomi" value={r.brigade} onChange={(e) => updateRow(i, { brigade: e.target.value, brigade_id: null })} style={inp} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <select value={r.kind_pay} onChange={(e) => updateRow(i, { kind_pay: e.target.value })} style={inp}>
                  <option value="avans">Avans</option>
                  <option value="yakuniy">Yakuniy</option>
                  <option value="boshqa">Boshqa</option>
                </select>
                <input placeholder="Summa" inputMode="decimal" value={r.amount} onChange={(e) => updateRow(i, { amount: e.target.value })} style={inp} />
              </div>
              <input placeholder="Izoh" value={r.note} onChange={(e) => updateRow(i, { note: e.target.value })} style={inp} />
            </>
          )}

          <div style={{ marginTop: 8, textAlign: "right", fontSize: 13, color: t.sub }}>
            Jami: <b style={{ color: t.fg }}>{fmt(totalOf(r))}</b>
          </div>
        </div>
      ))}

      <button onClick={addRow} style={{ ...btn, background: t.chipBg, color: t.fg, marginTop: 4, border: `2px dashed ${t.border}` }}>
        ➕ Yana satr qo'shish
      </button>

      <div style={{
        marginTop: 16, padding: 14, borderRadius: 12,
        background: t.sumBg, border: `2px solid ${t.sumBorder}`,
        fontSize: 14, color: t.fg,
      }}>
        Umumiy jami: <b>{fmt(grand)}</b> · {rows.length} satr
      </div>

      {msg && <div style={{ marginTop: 8, color: "#DC2626", fontSize: 13 }}>{msg}</div>}

      <button onClick={submit} disabled={submitting} style={{ ...btn, background: NAVY, color: "#FFFFFF", marginTop: 12, opacity: submitting ? 0.7 : 1 }}>
        {submitting ? "Saqlanmoqda..." : "✅ Yuborish va saqlash"}
      </button>
    </div>
  );
}
