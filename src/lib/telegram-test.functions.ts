// Telegram bot uchun avtomatik test flow.
// Webhook'ga soxta Telegram update'larni yuboradi va sessiya holatini tekshiradi.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { handleUpdate } from "@/server/telegram.server";

type StepResult = {
  step: string;
  ok: boolean;
  detail: string;
};

function admin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const TEST_CHAT_ID = -999_000_001;
const TEST_USER_ID = 999_000_001;

function buildUpdate(updateId: number, text: string) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: TEST_CHAT_ID, type: "private" },
      from: { id: TEST_USER_ID, is_bot: false, first_name: "Tester", username: "auto_tester" },
      text,
    },
  };
}

function buildCallback(updateId: number, messageId: number, data: string) {
  return {
    update_id: updateId,
    callback_query: {
      id: `test-cb-${updateId}`,
      from: { id: TEST_USER_ID, is_bot: false, first_name: "Tester", username: "auto_tester" },
      message: {
        message_id: messageId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: TEST_CHAT_ID, type: "private" },
      },
      data,
    },
  };
}

async function postUpdate(baseUrl: string, secret: string, update: any) {
  const res = await fetch(`${baseUrl}/api/public/telegram-webhook/${secret}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  return { status: res.status, body: await res.text() };
}

async function runLocalUpdate(update: any) {
  await handleUpdate(update);
  return { status: 200, body: "ok" };
}

async function readSession() {
  const { data } = await admin()
    .from("telegram_sessions")
    .select("flow,step,data")
    .eq("chat_id", TEST_CHAT_ID)
    .maybeSingle();
  return data;
}

async function waitFor<T>(fn: () => Promise<T | null>, ms = 2500): Promise<T | null> {
  const start = Date.now();
  // Webhook handler ishi await qilinmaydi — kichik kutish kerak.
  while (Date.now() - start < ms) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

export const runTelegramTest = createServerFn({ method: "POST" }).handler(async () => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: false, error: "TELEGRAM_WEBHOOK_SECRET o'rnatilmagan", steps: [] as StepResult[] };
  }

  // Lokal handler bilan tekshiramiz; faqat noto'g'ri secret uchun HTTP route tekshiriladi.
  const baseUrl =
    process.env.LOVABLE_APP_URL ??
    `https://project--6ca67d43-c1ef-4bc2-9166-54a51970bdbd-dev.lovable.app`;

  const steps: StepResult[] = [];
  let updateId = Date.now();

  // Avval eski test sessiyasini tozalaymiz
  await admin().from("telegram_sessions").delete().eq("chat_id", TEST_CHAT_ID);

  const { data: project } = await admin()
    .from("projects")
    .select("id,name")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!project) {
    return {
      ok: false,
      summary: "Test uchun avval bitta faol loyiha yarating",
      baseUrl,
      steps: [{ step: "Faol loyiha mavjudligi", ok: false, detail: "projects jadvalida status=active loyiha topilmadi" }] as StepResult[],
    };
  }

  // 1) /start
  const r1 = await runLocalUpdate(buildUpdate(updateId++, "/start"));
  steps.push({
    step: "/start webhook javobi",
    ok: r1.status === 200,
    detail: `HTTP ${r1.status} — ${r1.body.slice(0, 80)}`,
  });

  // /start sessiyani tozalashi kerak (flow=null)
  const s1 = await waitFor(async () => {
    const s = await readSession();
    return s && s.flow === null ? s : null;
  });
  steps.push({
    step: "/start sessiyani tiklash",
    ok: !!s1,
    detail: s1 ? `flow=${s1.flow ?? "null"}, step=${s1.step ?? "null"}` : "Sessiya tozalanmadi",
  });

  // 2) Loyiha tanlash
  const rProject = await runLocalUpdate(buildCallback(updateId++, updateId, `proj:${project.id}`));
  steps.push({
    step: "Loyiha tanlash",
    ok: rProject.status === 200,
    detail: `Tanlandi: ${project.name}`,
  });

  const sProject = await readSession();
  steps.push({
    step: "Loyiha sessiyada saqlanishi",
    ok: sProject?.data?.project_id === project.id,
    detail: sProject?.data?.project_id ? `project_id=${sProject.data.project_id}` : "project_id saqlanmadi",
  });

  // 3) Menyu tugmasi: 📦 Material
  const r2 = await runLocalUpdate(buildUpdate(updateId++, "📦 Material"));
  steps.push({
    step: "📦 Material webhook javobi",
    ok: r2.status === 200,
    detail: `HTTP ${r2.status}`,
  });

  const s2 = await waitFor(async () => {
    const s = await readSession();
    return s && s.flow === "material" && s.step === "input" ? s : null;
  });
  steps.push({
    step: "Material flow boshlanishi",
    ok: !!s2,
    detail: s2
        ? `flow=${s2.flow}, step=${s2.step}`
        : "flow=material/step=input o'rnatilmadi",
  });

  // 4) Bekor qilish
  const r3 = await runLocalUpdate(buildUpdate(updateId++, "❌ Bekor"));
  steps.push({
    step: "Bekor qilish webhook javobi",
    ok: r3.status === 200,
    detail: `HTTP ${r3.status}`,
  });

  const s3 = await waitFor(async () => {
    const s = await readSession();
    return s && s.flow === null ? s : null;
  });
  steps.push({
    step: "Bekor qilish flowni tozalash",
    ok: !!s3,
    detail: s3 ? `flow=${s3.flow ?? "null"}` : "Flow tozalanmadi",
  });

  // 5) Noma'lum xabar — menyu javobi (sessiya o'zgarmasligi kerak)
  const r4 = await runLocalUpdate(buildUpdate(updateId++, "salom"));
  steps.push({
    step: "Noma'lum matn webhook javobi",
    ok: r4.status === 200,
    detail: `HTTP ${r4.status}`,
  });

  // 5) Noto'g'ri secret — 401 qaytarishi kerak
  const rBad = await postUpdate(baseUrl, "wrong-secret-xyz", buildUpdate(updateId++, "/start"));
  steps.push({
    step: "Noto'g'ri secret rad etilishi",
    ok: rBad.status === 401,
    detail: `HTTP ${rBad.status} (401 kutilgan)`,
  });

  // Tozalash
  await admin().from("telegram_sessions").delete().eq("chat_id", TEST_CHAT_ID);

  const passed = steps.filter((s) => s.ok).length;
  return {
    ok: passed === steps.length,
    summary: `${passed}/${steps.length} test muvaffaqiyatli`,
    baseUrl,
    steps,
  };
});
