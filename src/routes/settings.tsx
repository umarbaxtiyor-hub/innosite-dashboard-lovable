import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { PlayCircle, CheckCircle2, XCircle, Loader2, Users, UserCog, Trash2, Pause, Play, ChevronRight, History, FolderKanban, ShieldCheck, Wallet, LayoutGrid, Settings2 } from "lucide-react";
import { ExpenseCategoriesSettings } from "@/components/settings/ExpenseCategoriesSettings";
import { ExpenseUnitsSettings } from "@/components/settings/ExpenseUnitsSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useServerFn } from "@tanstack/react-start";
import { runTelegramTest } from "@/lib/telegram-test.functions";
import { sendTelegramPing } from "@/lib/telegram-ping.functions";
import { listUsersWithRoles, setUserRole, createUserAccount, deleteUserAccount, setUserActive, setUserProjects, setUserFirms } from "@/lib/user-admin.functions";
import { ALL_ROLES, ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { MasterJadvalTemplatePanel } from "@/components/MasterJadvalTemplate";
import { useActiveProject } from "@/lib/project-context";
import { YordamchiLimitSettings } from "@/components/settings/YordamchiLimitSettings";
import { WorkScheduleSettings } from "@/components/settings/WorkScheduleSettings";
import { RolePermissionsSettings } from "@/components/settings/RolePermissionsSettings";
import { SecurityAuditPanel } from "@/components/settings/SecurityAuditPanel";
import { ProjectsManagementPanel } from "@/components/settings/ProjectsManagementPanel";


export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Sozlamalar — QurilishNazorat" }] }),
  component: SettingsPage,
});

const TABS = [
  { id: "loyihalar", label: "Loyihalar", icon: FolderKanban },
  { id: "foydalanuvchilar", label: "Foydalanuvchilar", icon: Users },
  { id: "moliya", label: "Moliya", icon: Wallet },
  { id: "xavfsizlik", label: "Xavfsizlik", icon: ShieldCheck },
  { id: "boshqa", label: "Boshqa", icon: Settings2 },
] as const;

function SettingsPage() {
  const { activeProjectId } = useActiveProject();
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <PageHeader title="Sozlamalar" subtitle="Tizim va loyiha sozlamalarini boshqarish." />

      <Tabs defaultValue="loyihalar" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/40 p-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="gap-1.5 data-[state=active]:bg-background">
              <t.icon className="h-3.5 w-3.5" />
              <span className="text-xs sm:text-sm">{t.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="loyihalar" className="mt-4 space-y-4">
          <ProjectsManagementPanel />
          <WorkScheduleSettings />
        </TabsContent>

        <TabsContent value="foydalanuvchilar" className="mt-4 space-y-4">
          <AdminListPanel />
          <UserManagementPanel />
          <RolePermissionsSettings />
        </TabsContent>

        <TabsContent value="moliya" className="mt-4 space-y-4">
          <YordamchiLimitSettings />
          <ExpenseCategoriesSettings />
          <ExpenseUnitsSettings />
        </TabsContent>

        <TabsContent value="xavfsizlik" className="mt-4 space-y-4">
          <SecurityAuditPanel />
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Audit log</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Tizimdagi barcha qo'shish, tahrirlash va o'chirish hodisalarini ko'rish.</p>
            <Button asChild size="sm" variant="outline"><Link to="/audit-log">Audit logni ochish</Link></Button>
          </div>
        </TabsContent>

        <TabsContent value="boshqa" className="mt-4 space-y-4">
          <MasterJadvalTemplatePanel projectId={activeProjectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AdminListPanel() {
  const [admins, setAdmins] = useState<Array<{ id: string; full_name: string | null; telegram_user_id: number | null; telegram_username: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: roles, error: rErr } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        if (rErr) throw rErr;
        const ids = (roles ?? []).map((r) => r.user_id);
        if (ids.length === 0) { setAdmins([]); return; }
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("id, full_name, telegram_user_id, telegram_username")
          .in("id", ids);
        if (pErr) throw pErr;
        setAdmins(profs ?? []);
      } catch (e: any) {
        setError(e.message ?? "Xatolik");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Adminlar ro'yxati</h3>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/auth">Kirish / Ro'yxat</Link></Button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...</div>
      ) : error ? (
        <p className="text-sm text-destructive">{error} — ehtimol kirgan emassiz. Avval <Link to="/auth" className="underline">kiring</Link>.</p>
      ) : admins.length === 0 ? (
        <p className="text-sm text-muted-foreground">Hozircha admin yo'q.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-2">Ism</th><th>Telegram username</th><th>Telegram ID</th></tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="py-2">{a.full_name || "—"}</td>
                  <td>{a.telegram_username ? "@" + a.telegram_username : <span className="text-muted-foreground">— (botda /start bosing)</span>}</td>
                  <td>{a.telegram_user_id ?? <span className="text-muted-foreground">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            ⚠️ Telegram xabar olish uchun admin <code>telegram_user_id</code>'si to'ldirilgan bo'lishi shart. Bot bilan <code>/start</code> bosing.
          </p>
        </div>
      )}
    </div>
  );
}

type TestResult = Awaited<ReturnType<typeof runTelegramTest>>;

function TelegramTestPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const res = await runTelegramTest();
      setResult(res);
    } catch (e: any) {
      setResult({ ok: false, summary: "Xatolik: " + (e?.message ?? String(e)), baseUrl: "", steps: [] } as any);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Telegram bot — avtomatik test</h3>
        </div>
        <Button size="sm" onClick={run} disabled={running}>
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
          Testni ishga tushirish
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Webhook'ga soxta /start, menyu tugmasi va bekor qilish xabarlarini yuboradi va sessiya holatini tekshiradi.
      </p>

      {result && (
        <div className="mt-4 space-y-2">
          <div className={`flex items-center gap-2 text-sm font-medium ${result.ok ? "text-success" : "text-destructive"}`}>
            {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {result.summary ?? (result as any).error}
          </div>
          {result.baseUrl && (
            <div className="text-xs text-muted-foreground">URL: <code>{result.baseUrl}</code></div>
          )}
          <ul className="space-y-1">
            {result.steps?.map((s, i) => (
              <li key={i} className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                {s.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{s.step}</div>
                  <div className="text-muted-foreground">{s.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="text-sm text-foreground/80">{children}</div>
    </div>
  );
}

function TelegramPingPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof sendTelegramPing>> | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await sendTelegramPing();
      setResult(r);
    } catch (e: any) {
      setResult({ ok: false, error: e?.message ?? String(e), results: [] } as any);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Telegram bot — sinov xabari</h3>
        </div>
        <Button size="sm" onClick={run} disabled={running}>
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Yuborish
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Barcha adminlarga (telegram_user_id biriktirilgan) haqiqiy sinov xabari yuboradi.
      </p>

      {result && (
        <div className="mt-4 space-y-2">
          <div className={`flex items-center gap-2 text-sm font-medium ${result.ok ? "text-success" : "text-destructive"}`}>
            {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {result.ok
              ? `✅ ${(result as any).sent}/${(result as any).total} adminga xabar yuborildi`
              : `❌ ${(result as any).error ?? "Xatolik"}`}
          </div>
          {Array.isArray(result.results) && result.results.length > 0 && (
            <ul className="space-y-1">
              {result.results.map((r: any, i: number) => (
                <li key={i} className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                  {r.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{r.name} <span className="text-muted-foreground">({r.chat_id})</span></div>
                    {r.error && <div className="text-destructive">{r.error}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ALL_ROLES va ROLE_LABELS endi @/lib/permissions dan keladi (10 ta yangi rol).

type UserRow = {
  id: string;
  full_name: string | null;
  telegram_user_id: number | null;
  telegram_username: string | null;
  phone: string | null;
  is_active: boolean;
  firm_id: string | null;
  roles: string[];
  project_ids: string[];
  firm_ids: string[];
};

function UserManagementPanel() {
  const listFn = useServerFn(listUsersWithRoles);
  const setRoleFn = useServerFn(setUserRole);
  
  const createFn = useServerFn(createUserAccount);
  const deleteFn = useServerFn(deleteUserAccount);
  const setActiveFn = useServerFn(setUserActive);
  const setProjectsFn = useServerFn(setUserProjects);
  const setFirmsFn = useServerFn(setUserFirms);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [firms, setFirms] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function getToken(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token;
    if (!t) throw new Error("Iltimos, tizimga kiring");
    return t;
  }

  async function showError(e: any) {
    let msg = "Noma'lum xatolik";
    try {
      if (typeof e === "string") msg = e;
      else if (e instanceof Response) msg = (await e.text().catch(() => "")) || `Server xatolik (${e.status})`;
      else if (e?.message) msg = String(e.message);
      else msg = JSON.stringify(e);
    } catch {}
    toast.error("Xatolik", { description: msg.slice(0, 200) });
    return msg;
  }

  async function load() {
    setLoading(true); setError(null);
    try {
      const token = await getToken();
      const [u, p, f] = await Promise.all([
        listFn({ data: { token } }) as Promise<UserRow[]>,
        supabase.from("projects").select("id, name, code").order("name"),
        supabase.from("firms").select("id, name").order("name"),
      ]);
      setUsers(u);
      setProjects((p.data ?? []) as any);
      setFirms((f.data ?? []) as any);
    }
    catch (e: any) { setError(await showError(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const openUser = openUserId ? users.find((x) => x.id === openUserId) ?? null : null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserCog className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Foydalanuvchilar</h3>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowCreate(true)}>+ Yangi foydalanuvchi</Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Yangilash
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Yuklanmoqda...</div>}
      {!error && !loading && users.length === 0 && <p className="text-sm text-muted-foreground">Foydalanuvchi topilmadi.</p>}

      {!error && !loading && users.length > 0 && (
        <div className="divide-y divide-border rounded-lg border border-border">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => setOpenUserId(u.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{u.full_name || "—"}</span>
                  {!u.is_active && <Badge variant="destructive" className="text-[10px]">to'xtatilgan</Badge>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  {u.roles.length > 0
                    ? u.roles.map((r) => <Badge key={r} variant="secondary" className="text-[10px]">{ROLE_LABELS[r as AppRole] ?? r}</Badge>)
                    : <span>rolsiz</span>}
                  <span>· {u.project_ids.length} loyiha · {u.firm_ids.length} firma</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {/* User detail dialog */}
      <Dialog open={!!openUser} onOpenChange={(o) => !o && setOpenUserId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {openUser && (
            <UserDetailDialog
              user={openUser}
              projects={projects}
              firms={firms}
              onClose={() => setOpenUserId(null)}
              onChange={(patch) => setUsers((prev) => prev.map((x) => x.id === openUser.id ? { ...x, ...patch } : x))}
              onDeleted={() => { setUsers((prev) => prev.filter((x) => x.id !== openUser.id)); setOpenUserId(null); }}
              setRoleFn={setRoleFn}
              setActiveFn={setActiveFn}
              setProjectsFn={setProjectsFn}
              setFirmsFn={setFirmsFn}
              deleteFn={deleteFn}
              getToken={getToken}
              showError={showError}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Create user dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <CreateUserDialog
            projects={projects}
            firms={firms}
            onClose={() => setShowCreate(false)}
            onCreated={async () => { setShowCreate(false); await load(); }}
            createFn={createFn}
            setProjectsFn={setProjectsFn}
            setFirmsFn={setFirmsFn}
            setRoleFn={setRoleFn}
            getToken={getToken}
            showError={showError}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserDetailDialog({
  user, projects, firms, onClose, onChange, onDeleted,
  setRoleFn, setActiveFn, setProjectsFn, setFirmsFn, deleteFn,
  getToken, showError,
}: {
  user: UserRow;
  projects: Array<{ id: string; name: string; code: string }>;
  firms: Array<{ id: string; name: string }>;
  onClose: () => void;
  onChange: (patch: Partial<UserRow>) => void;
  onDeleted: () => void;
  setRoleFn: any; setActiveFn: any; setProjectsFn: any; setFirmsFn: any; deleteFn: any;
  getToken: () => Promise<string>;
  showError: (e: any) => Promise<string>;
}) {
  const [roles, setRoles] = useState<string[]>(user.roles);
  const [pIds, setPIds] = useState<string[]>(user.project_ids);
  const [fIds, setFIds] = useState<string[]>(user.firm_ids);
  const [saving, setSaving] = useState(false);

  async function saveAll() {
    setSaving(true);
    try {
      const token = await getToken();
      const tasks: Promise<any>[] = [];
      // roles diff
      for (const r of roles) if (!user.roles.includes(r)) tasks.push(setRoleFn({ data: { token, user_id: user.id, role: r, enabled: true } }));
      for (const r of user.roles) if (!roles.includes(r)) tasks.push(setRoleFn({ data: { token, user_id: user.id, role: r, enabled: false } }));
      // projects/firms (full sync)
      const projChanged = pIds.length !== user.project_ids.length || pIds.some((x) => !user.project_ids.includes(x));
      if (projChanged) tasks.push(setProjectsFn({ data: { token, user_id: user.id, project_ids: pIds } }));
      const firmChanged = fIds.length !== user.firm_ids.length || fIds.some((x) => !user.firm_ids.includes(x));
      if (firmChanged) tasks.push(setFirmsFn({ data: { token, user_id: user.id, firm_ids: fIds } }));
      await Promise.all(tasks);
      onChange({ roles, project_ids: pIds, firm_ids: fIds });
      toast.success("Saqlandi");
      onClose();
    } catch (e: any) { await showError(e); }
    finally { setSaving(false); }
  }

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setCurrentUserId(data.session?.user?.id ?? null));
  }, []);
  const isSelf = currentUserId === user.id;

  async function doToggleActive() {
    if (isSelf && user.is_active) { toast.error("O'zingizni to'xtata olmaysiz"); return; }
    try {
      const token = await getToken();
      await setActiveFn({ data: { token, user_id: user.id, active: !user.is_active } });
      onChange({ is_active: !user.is_active });
      toast.success(user.is_active ? "To'xtatildi" : "Faollashtirildi");
    } catch (e: any) { await showError(e); }
  }

  async function doDelete() {
    if (isSelf) { toast.error("O'zingizni o'chira olmaysiz"); return; }
    if (!confirm(`"${user.full_name || user.id}" foydalanuvchisini butunlay o'chirasizmi?`)) return;
    try {
      const token = await getToken();
      await deleteFn({ data: { token, user_id: user.id } });
      toast.success("O'chirildi");
      onDeleted();
    } catch (e: any) { await showError(e); }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {user.full_name || "—"}
          {!user.is_active && <Badge variant="destructive">to'xtatilgan</Badge>}
        </DialogTitle>
        <DialogDescription>
          {user.telegram_username ? "@" + user.telegram_username : "Telegram username yo'q"}
          {user.phone ? ` • ${user.phone}` : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Telegram User ID: <span className="font-mono text-foreground">{user.telegram_user_id ?? "—"}</span>
          {" "}· avtomatik to'ldiriladi (user botda <code>/start</code> bosib telefonini ulashganda).
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Rollar</div>
          <div className="flex flex-wrap gap-3">
            {ALL_ROLES.map((r) => {
              const on = roles.includes(r);
              return (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={on} onCheckedChange={(v) => setRoles((prev) => v ? [...prev, r] : prev.filter((x) => x !== r))} />
                  <span className={on ? "font-medium" : "text-muted-foreground"}>{ROLE_LABELS[r as AppRole] ?? r}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Loyihalar ({pIds.length})</div>
            {projects.length === 0 ? <p className="text-xs text-muted-foreground">Loyiha yo'q</p> : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {projects.map((p) => {
                  const on = pIds.includes(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={on} onCheckedChange={(v) => setPIds((prev) => v ? [...prev, p.id] : prev.filter((x) => x !== p.id))} />
                      <span className={on ? "font-medium" : ""}>{p.code} — {p.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Firmalar ({fIds.length})</div>
            {firms.length === 0 ? <p className="text-xs text-muted-foreground">Firma yo'q</p> : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {firms.map((f) => {
                  const on = fIds.includes(f.id);
                  return (
                    <label key={f.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={on} onCheckedChange={(v) => setFIds((prev) => v ? [...prev, f.id] : prev.filter((x) => x !== f.id))} />
                      <span className={on ? "font-medium" : ""}>{f.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={doToggleActive} disabled={isSelf && user.is_active}>
            {user.is_active ? <><Pause className="mr-1 h-4 w-4" /> To'xtatish</> : <><Play className="mr-1 h-4 w-4" /> Faollashtirish</>}
          </Button>
          <Button variant="destructive" size="sm" onClick={doDelete} disabled={isSelf}>
            <Trash2 className="mr-1 h-4 w-4" /> O'chirish
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Bekor</Button>
          <Button onClick={saveAll} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Saqlash
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

function CreateUserDialog({
  projects, firms, onClose, onCreated,
  createFn, setProjectsFn, setFirmsFn, setRoleFn, getToken, showError,
}: {
  projects: Array<{ id: string; name: string; code: string }>;
  firms: Array<{ id: string; name: string }>;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  createFn: any; setProjectsFn: any; setFirmsFn: any; setRoleFn: any;
  getToken: () => Promise<string>;
  showError: (e: any) => Promise<string>;
}) {
  const [form, setForm] = useState({ full_name: "", pin: "", phone: "" });
  const [roles, setRoles] = useState<string[]>([]);
  const [pIds, setPIds] = useState<string[]>([]);
  const [fIds, setFIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  async function submit() {
    if (form.full_name.trim().length < 2) { toast.error("Ism kamida 2 harf bo'lsin"); return; }
    if (!/^\d{4}$/.test(form.pin)) { toast.error("Parol aniq 4 raqam bo'lsin"); return; }
    setCreating(true);
    try {
      const token = await getToken();
      const res: any = await createFn({ data: { token, full_name: form.full_name.trim(), pin: form.pin, phone: form.phone } });
      const uid = res?.user_id;
      if (uid) {
        const tasks: Promise<any>[] = [];
        if (pIds.length > 0) tasks.push(setProjectsFn({ data: { token, user_id: uid, project_ids: pIds } }));
        if (fIds.length > 0) tasks.push(setFirmsFn({ data: { token, user_id: uid, firm_ids: fIds } }));
        for (const r of roles) tasks.push(setRoleFn({ data: { token, user_id: uid, role: r, enabled: true } }));
        await Promise.all(tasks);
      }
      toast.success(`Foydalanuvchi yaratildi — login: "${form.full_name.trim()}", parol: ${form.pin}`);
      await onCreated();
    } catch (e: any) { await showError(e); }
    finally { setCreating(false); }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Yangi foydalanuvchi</DialogTitle>
        <DialogDescription>Ismi va 4 raqamli parolni kiriting. Foydalanuvchi shu ma'lumotlar bilan tizimga kiradi.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">To'liq ism *</label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Masalan: Ali Valiyev" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">4 raqamli parol *</label>
            <Input
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Telefon</label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Rollar</div>
          <div className="flex flex-wrap gap-3">
            {ALL_ROLES.map((r) => {
              const on = roles.includes(r);
              return (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={on} onCheckedChange={(v) => setRoles((prev) => v ? [...prev, r] : prev.filter((x) => x !== r))} />
                  <span className={on ? "font-medium" : "text-muted-foreground"}>{ROLE_LABELS[r as AppRole] ?? r}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Loyihalar ({pIds.length})</div>
            {projects.length === 0 ? <p className="text-xs text-muted-foreground">Loyiha yo'q</p> : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {projects.map((p) => {
                  const on = pIds.includes(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={on} onCheckedChange={(v) => setPIds((prev) => v ? [...prev, p.id] : prev.filter((x) => x !== p.id))} />
                      <span className={on ? "font-medium" : ""}>{p.code} — {p.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Firmalar ({fIds.length})</div>
            {firms.length === 0 ? <p className="text-xs text-muted-foreground">Firma yo'q</p> : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {firms.map((f) => {
                  const on = fIds.includes(f.id);
                  return (
                    <label key={f.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={on} onCheckedChange={(v) => setFIds((prev) => v ? [...prev, f.id] : prev.filter((x) => x !== f.id))} />
                      <span className={on ? "font-medium" : ""}>{f.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Bekor</Button>
        <Button onClick={submit} disabled={creating}>
          {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Yaratish
        </Button>
      </DialogFooter>
    </>
  );
}
