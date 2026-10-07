// Bir betlik CEO hisoboti — pdf-lib bilan (brauzerda ham, workerda ham ishlaydi).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { CeoReport } from "./ceo-report-data";

// pdf-lib standart shriftlari WinAnsi — o'zbekcha maxsus apostroflarni almashtiramiz
const ascii = (s: string) =>
  (s ?? "")
    .replace(/[\u2018\u2019\u02bb\u02bc\u2032]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");

const NAVY = rgb(0.059, 0.09, 0.165);
const NAVY2 = rgb(0.118, 0.161, 0.231);
const ORANGE = rgb(0.976, 0.451, 0.086);
const WHITE = rgb(1, 1, 1);
const SLATE = rgb(0.42, 0.47, 0.55);
const INK = rgb(0.09, 0.12, 0.18);
const LINE = rgb(0.88, 0.9, 0.93);
const GREEN = rgb(0.06, 0.65, 0.45);
const RED = rgb(0.86, 0.25, 0.32);
const BLUE = rgb(0.15, 0.45, 0.85);

function money(n: number): string {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? "-" : "";
  return sign + Math.abs(v).toLocaleString("en-US").replace(/,/g, " ");
}
function short(n: number): string {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)} mlrd`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)} mln`;
  if (a >= 1e3) return `${Math.round(v / 1e3)} ming`;
  return money(v);
}
function fmtDate(d?: string | null) {
  if (!d) return "-";
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}.${m}.${y}` : d;
}

export function ceoReportFileName(r: CeoReport) {
  const d = new Date().toISOString().slice(0, 10);
  const name = ascii(r.projectName).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "loyiha";
  return `${name}-${d}.pdf`;
}

export async function renderCeoReportPdf(r: CeoReport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const W = 595.28;
  const M = 32;
  const CW = W - M * 2;

  const text = (
    s: string,
    x: number,
    y: number,
    opts: { size?: number; font?: PDFFont; color?: any; align?: "left" | "center" | "right"; width?: number } = {},
  ) => {
    const size = opts.size ?? 9;
    const font = opts.font ?? reg;
    const str = ascii(s);
    let px = x;
    if (opts.align === "center") px = x + ((opts.width ?? 0) - font.widthOfTextAtSize(str, size)) / 2;
    if (opts.align === "right") px = x + (opts.width ?? 0) - font.widthOfTextAtSize(str, size);
    page.drawText(str, { x: px, y, size, font, color: opts.color ?? INK });
  };
  const box = (x: number, y: number, w: number, h: number, fill?: any, border = true) => {
    page.drawRectangle({
      x, y, width: w, height: h,
      color: fill,
      borderColor: border ? LINE : undefined,
      borderWidth: border ? 1 : 0,
    });
  };
  const bar = (x: number, y: number, w: number, pct: number, color: any, track = rgb(0.9, 0.92, 0.95)) => {
    page.drawRectangle({ x, y, width: w, height: 5, color: track });
    const p = Math.max(0, Math.min(100, pct));
    if (p > 0) page.drawRectangle({ x, y, width: (w * p) / 100, height: 5, color });
  };

  // ---------- Header ----------
  const headH = 96;
  let y = 841.89 - headH;
  page.drawRectangle({ x: 0, y, width: W, height: headH, color: NAVY });
  page.drawRectangle({ x: 0, y, width: 6, height: headH, color: ORANGE });

  text("INNOSITE - LOYIHA KUNLIK HISOBOTI", M, y + headH - 26, { size: 8, font: bold, color: ORANGE });
  text(r.projectName, M, y + headH - 48, { size: 17, font: bold, color: WHITE });
  const sub = [r.projectCode, r.location].filter(Boolean).join(" | ");
  text(sub || " ", M, y + headH - 63, { size: 8.5, color: rgb(0.72, 0.76, 0.82) });
  text(
    `${fmtDate(r.startDate)} - ${fmtDate(r.endDate)}   |   O'tdi: ${r.daysPassed ?? "-"} kun   |   ${
      r.daysLeft == null ? "-" : r.daysLeft < 0 ? `Kechikdi: ${Math.abs(r.daysLeft)} kun` : `Qoldi: ${r.daysLeft} kun`
    }`,
    M, y + headH - 79, { size: 8.5, color: rgb(0.82, 0.86, 0.9) },
  );

  // progress blok (o'ng tomonda)
  const pbW = 150;
  const pbX = W - M - pbW;
  page.drawRectangle({ x: pbX, y: y + 22, width: pbW, height: 52, color: NAVY2 });
  text("BAJARILISH", pbX, y + 62, { size: 7.5, font: bold, color: rgb(0.7, 0.75, 0.82), align: "center", width: pbW });
  text(`${r.progress}%`, pbX, y + 38, { size: 22, font: bold, color: WHITE, align: "center", width: pbW });
  bar(pbX + 12, y + 33, pbW - 24, r.progress, ORANGE, rgb(0.2, 0.25, 0.34));
  text(
    r.expectedPct == null ? "reja: -" : `reja bo'yicha: ${r.expectedPct}%`,
    pbX, y + 23, { size: 7, color: rgb(0.65, 0.7, 0.78), align: "center", width: pbW },
  );

  y -= 20;

  // ---------- Section helper ----------
  const section = (title: string, h: number) => {
    y -= h;
    box(M, y, CW, h, rgb(0.99, 0.99, 1));
    page.drawRectangle({ x: M, y: y + h - 20, width: CW, height: 20, color: rgb(0.95, 0.96, 0.98) });
    text(title, M + 10, y + h - 14, { size: 8.5, font: bold, color: NAVY });
    return y;
  };
  const cell = (
    x: number, w: number, top: number,
    label: string, value: string, note?: string, color: any = INK,
  ) => {
    text(label, x, top - 12, { size: 7.5, font: bold, color: SLATE });
    text(value, x, top - 30, { size: 14, font: bold, color });
    if (note) text(note, x, top - 42, { size: 7.5, color: SLATE });
  };

  // ---------- 1. Shartnoma ----------
  let s = section("1. SHARTNOMA", 78);
  const col3 = (CW - 20) / 3;
  const inPct = r.contract > 0 ? Math.round((r.contractIn / r.contract) * 100) : 0;
  cell(M + 10, col3, s + 58, "SHARTNOMA SUMMASI", `${short(r.contract)}`, `${money(r.contract)} so'm`, NAVY);
  cell(M + 10 + col3, col3, s + 58, "TUSHGAN (KIRIM)", `${short(r.contractIn)}`, `${inPct}%  |  ${money(r.contractIn)} so'm`, GREEN);
  cell(M + 10 + col3 * 2, col3, s + 58, "QOLDIQ", `${short(r.contractQoldiq)}`, `${money(r.contractQoldiq)} so'm`, ORANGE);
  bar(M + 10, s + 10, CW - 20, inPct, GREEN);

  // ---------- 2. Moliya ----------
  y -= 10;
  s = section("2. MOLIYA (KASSA)", 74);
  const col4 = (CW - 20) / 4;
  cell(M + 10, col4, s + 54, "KASSA KIRIM", short(r.kassaIn), `${money(r.kassaIn)} so'm`, GREEN);
  cell(M + 10 + col4, col4, s + 54, "CHIQIM", short(r.totalOut), `${money(r.totalOut)} so'm`, RED);
  cell(M + 10 + col4 * 2, col4, s + 54, "QOLDIQ", short(r.balance), `${money(r.balance)} so'm`, r.balance < 0 ? RED : BLUE);
  cell(M + 10 + col4 * 3, col4, s + 54, "NAQD / BANK", `${short(r.kassaNaqd)}`, `bank: ${short(r.kassaBank)}`, NAVY);

  // ---------- 3. Smeta ----------
  y -= 10;
  s = section("3. SMETA BO'YICHA XARAJAT", 108);
  const tot = r.spendMaterial + r.spendWork + r.spendOperatsion || 1;
  const rows: [string, number, any][] = [
    ["Material", r.spendMaterial, BLUE],
    ["Ishlar", r.spendWork, ORANGE],
    ["Operatsion", r.spendOperatsion, GREEN],
  ];
  let ry = s + 74;
  rows.forEach(([label, val, color]) => {
    const pct = Math.round((val / tot) * 100);
    text(label, M + 10, ry, { size: 9, font: bold });
    text(`${money(val)} so'm`, M + 10, ry, { size: 9, font: bold, align: "right", width: 250 });
    text(`${pct}%`, M + 275, ry, { size: 9, font: bold, color });
    bar(M + 305, ry + 1, CW - 315, pct, color);
    ry -= 18;
  });
  page.drawLine({ start: { x: M + 10, y: ry + 6 }, end: { x: W - M - 10, y: ry + 6 }, color: LINE, thickness: 1 });
  text("JAMI", M + 10, ry - 6, { size: 9, font: bold, color: NAVY });
  text(`${money(r.spendMaterial + r.spendWork + r.spendOperatsion)} so'm`, M + 10, ry - 6, {
    size: 9, font: bold, align: "right", width: 250, color: NAVY,
  });

  // ---------- 4. Jamoa ----------
  y -= 10;
  s = section("4. JAMOA VA TEXNIKA (bugun)", 74);
  cell(M + 10, col4, s + 54, "BUGUN XODIM", `${r.todayEmpCount} ta`, `oylik: ${short(r.salaryPaid)}`, NAVY);
  cell(M + 10 + col4, col4, s + 54, "BUGUN USTA", `${r.todayUstaCount} ta`, `to'landi: ${short(r.ustaPaid)}`, NAVY);
  cell(M + 10 + col4 * 2, col4, s + 54, "TEXNIKA", short(r.texnikaSum), `${money(r.texnikaSum)} so'm`, NAVY);
  cell(M + 10 + col4 * 3, col4, s + 54, "JAMI ODAM", `${r.todayEmpCount + r.todayUstaCount} ta`, "bugun ishda", NAVY);

  // ---------- 5. Ish turlari ----------
  y -= 10;
  const workRows = r.topWorks.slice(0, 8);
  s = section("5. ASOSIY ISH TURLARI (bajarilishi)", 32 + Math.max(1, workRows.length) * 15);
  let wy = s + (32 + Math.max(1, workRows.length) * 15) - 34;
  if (workRows.length === 0) {
    text("Ma'lumot yo'q", M + 10, wy, { size: 8.5, color: SLATE });
  } else {
    workRows.forEach((w) => {
      const name = w.name.length > 44 ? `${w.name.slice(0, 43)}...` : w.name;
      text(name, M + 10, wy, { size: 8 });
      text(short(w.amount), M + 240, wy, { size: 8, color: SLATE, align: "right", width: 60 });
      bar(M + 312, wy + 1, CW - 370, w.pct, w.pct >= 90 ? GREEN : w.pct > 0 ? ORANGE : rgb(0.8, 0.82, 0.86));
      text(`${Math.round(w.pct)}%`, W - M - 46, wy, { size: 8, font: bold, align: "right", width: 36 });
      wy -= 15;
    });
  }

  // ---------- 6. Top xarajat kategoriyalari ----------
  y -= 10;
  const cats = r.topCategories.slice(0, 5);
  s = section("6. ENG KATTA XARAJAT KATEGORIYALARI", 32 + Math.max(1, cats.length) * 15);
  let cy = s + (32 + Math.max(1, cats.length) * 15) - 34;
  const catMax = cats.length ? cats[0].value : 1;
  if (cats.length === 0) {
    text("Ma'lumot yo'q", M + 10, cy, { size: 8.5, color: SLATE });
  } else {
    cats.forEach((c) => {
      text(c.name, M + 10, cy, { size: 8 });
      text(`${money(c.value)} so'm`, M + 190, cy, { size: 8, align: "right", width: 110, font: bold });
      bar(M + 312, cy + 1, CW - 330, (c.value / catMax) * 100, BLUE);
      cy -= 15;
    });
  }

  // ---------- Footer ----------
  const gen = new Date(r.generatedAt);
  page.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, color: LINE, thickness: 1 });
  text(
    `Innosite Construction Management  |  hisobot: ${gen.toISOString().slice(0, 10)} ${gen.toISOString().slice(11, 16)} UTC`,
    M, 28, { size: 7.5, color: SLATE },
  );
  text("Maxfiy - faqat rahbariyat uchun", M, 28, { size: 7.5, color: SLATE, align: "right", width: CW });

  return await pdf.save();
}
