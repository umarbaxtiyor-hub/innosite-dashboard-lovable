// Excel eksporti uchun diagrammalarni canvas'da chizish (PNG data URL qaytaradi).

export const PALETTE = [
  "#2563EB", "#0EA5E9", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6",
];

const FONT = (size: number, weight = "400") => `${weight} ${size}px Arial, sans-serif`;

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  const dpr = 2;
  c.width = w * dpr;
  c.height = h * dpr;
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);
  return { c, ctx };
}

function title(ctx: CanvasRenderingContext2D, text: string, sub: string, w: number) {
  ctx.fillStyle = "#0F172A";
  ctx.font = FONT(16, "700");
  ctx.textAlign = "left";
  ctx.fillText(text, 16, 26);
  if (sub) {
    ctx.fillStyle = "#64748B";
    ctx.font = FONT(11);
    ctx.fillText(sub, 16, 43);
  }
  ctx.strokeStyle = "#E2E8F0";
  ctx.beginPath();
  ctx.moveTo(16, 52);
  ctx.lineTo(w - 16, 52);
  ctx.stroke();
}

const shortNum = (v: number) => {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)} mlrd`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)} mln`;
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)} ming`;
  return String(Math.round(v));
};

/** Donut diagramma + o'ng tomonda legenda */
export function drawDonut(data: { name: string; value: number }[], heading: string, sub = "") {
  const w = 760, h = 420;
  const { c, ctx } = makeCanvas(w, h);
  title(ctx, heading, sub, w);

  const rows = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!total) return c.toDataURL("image/png");

  const cx = 200, cy = 240, R = 130, r = 72;
  let a0 = -Math.PI / 2;
  rows.forEach((row, i) => {
    const a1 = a0 + (row.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0, a1);
    ctx.closePath();
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.stroke();
    a0 = a1;
  });
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();

  ctx.textAlign = "center";
  ctx.fillStyle = "#0F172A";
  ctx.font = FONT(16, "700");
  ctx.fillText(shortNum(total), cx, cy + 2);
  ctx.fillStyle = "#64748B";
  ctx.font = FONT(10);
  ctx.fillText("Jami", cx, cy + 18);

  ctx.textAlign = "left";
  let y = 100;
  rows.forEach((row, i) => {
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fillRect(400, y - 9, 12, 12);
    ctx.fillStyle = "#0F172A";
    ctx.font = FONT(12, "600");
    const name = row.name.length > 24 ? `${row.name.slice(0, 23)}…` : row.name;
    ctx.fillText(name, 420, y);
    ctx.fillStyle = "#475569";
    ctx.font = FONT(11);
    ctx.textAlign = "right";
    ctx.fillText(`${shortNum(row.value)}  (${((row.value / total) * 100).toFixed(1)}%)`, w - 20, y);
    ctx.textAlign = "left";
    y += 30;
  });
  return c.toDataURL("image/png");
}

/** Guruhlangan ustunli diagramma (Reja vs Fakt) */
export function drawGroupedBars(
  data: { name: string; planned: number; actual: number }[],
  heading: string,
  sub = "",
) {
  const w = 760, h = 420;
  const { c, ctx } = makeCanvas(w, h);
  title(ctx, heading, sub, w);
  const rows = data.slice(0, 7);
  if (!rows.length) return c.toDataURL("image/png");

  const left = 80, right = w - 24, top = 90, bottom = h - 60;
  const max = Math.max(...rows.flatMap((r) => [r.planned, r.actual]), 1);

  ctx.strokeStyle = "#E2E8F0";
  ctx.fillStyle = "#94A3B8";
  ctx.font = FONT(10);
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const y = bottom - ((bottom - top) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillText(shortNum((max * i) / 4), left - 8, y + 3);
  }

  const slot = (right - left) / rows.length;
  const bw = Math.min(38, slot / 3);
  rows.forEach((row, i) => {
    const cx = left + slot * i + slot / 2;
    const vals: [number, string][] = [[row.planned, "#2563EB"], [row.actual, "#10B981"]];
    vals.forEach(([v, color], k) => {
      const bh = ((bottom - top) * v) / max;
      const x = cx - bw - 3 + k * (bw + 6);
      ctx.fillStyle = color;
      ctx.fillRect(x, bottom - bh, bw, bh);
      ctx.fillStyle = "#334155";
      ctx.font = FONT(9, "600");
      ctx.textAlign = "center";
      if (bh > 12) ctx.fillText(shortNum(v), x + bw / 2, bottom - bh - 4);
    });
    ctx.fillStyle = "#0F172A";
    ctx.font = FONT(11, "600");
    ctx.textAlign = "center";
    const name = row.name.length > 14 ? `${row.name.slice(0, 13)}…` : row.name;
    ctx.fillText(name, cx, bottom + 18);
  });

  // legenda
  const legend: [string, string][] = [["Reja", "#2563EB"], ["Fakt", "#10B981"]];
  let lx = left;
  legend.forEach(([label, color]) => {
    ctx.fillStyle = color;
    ctx.fillRect(lx, h - 28, 12, 12);
    ctx.fillStyle = "#334155";
    ctx.font = FONT(11);
    ctx.textAlign = "left";
    ctx.fillText(label, lx + 18, h - 18);
    lx += 90;
  });
  return c.toDataURL("image/png");
}

/** Maydonli (area) chiziqli diagramma — kunlik dinamika */
export function drawArea(data: { day: string; value: number }[], heading: string, sub = "") {
  const w = 760, h = 420;
  const { c, ctx } = makeCanvas(w, h);
  title(ctx, heading, sub, w);
  const rows = data;
  if (rows.length < 2) return c.toDataURL("image/png");

  const left = 80, right = w - 24, top = 90, bottom = h - 50;
  const max = Math.max(...rows.map((r) => r.value), 1);

  ctx.strokeStyle = "#E2E8F0";
  ctx.fillStyle = "#94A3B8";
  ctx.font = FONT(10);
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const y = bottom - ((bottom - top) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillText(shortNum((max * i) / 4), left - 8, y + 3);
  }

  const px = (i: number) => left + ((right - left) * i) / (rows.length - 1);
  const py = (v: number) => bottom - ((bottom - top) * v) / max;

  const grad = ctx.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, "rgba(14,165,233,0.45)");
  grad.addColorStop(1, "rgba(14,165,233,0.02)");
  ctx.beginPath();
  ctx.moveTo(px(0), bottom);
  rows.forEach((r, i) => ctx.lineTo(px(i), py(r.value)));
  ctx.lineTo(px(rows.length - 1), bottom);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  rows.forEach((r, i) => (i ? ctx.lineTo(px(i), py(r.value)) : ctx.moveTo(px(i), py(r.value))));
  ctx.strokeStyle = "#0EA5E9";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = "#64748B";
  ctx.font = FONT(9);
  ctx.textAlign = "center";
  rows.forEach((r, i) => {
    if (i % Math.ceil(rows.length / 8) === 0) ctx.fillText(r.day, px(i), bottom + 16);
  });
  return c.toDataURL("image/png");
}
