import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { FolderKanban, Plus, Pencil, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Project = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  total_budget: number | null;
  pm_name: string | null;
  firm_id: string | null;
  status: string | null;
};

type Firm = { id: string; name: string };

export function ProjectsManagementPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: p, error: pe }, { data: f }] = await Promise.all([
      supabase.from("projects").select("id, code, name, location, total_budget, pm_name, firm_id, status").order("created_at", { ascending: false }),
      supabase.from("firms").select("id, name").order("name"),
    ]);
    if (pe) toast.error(pe.message);
    setProjects(p ?? []);
    setFirms(f ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (p: Project) => {
    if (!confirm(`"${p.name}" loyihasini o'chirasizmi? Bu barcha bog'liq ma'lumotlarni ham o'chiradi.`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Loyiha o'chirildi");
    load();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Loyihalarni boshqarish</h3>
        </div>
        <Button size="sm" onClick={() => setOpenCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Yangi loyiha
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...</div>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Hozircha loyiha yo'q.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">Nomi</th>
                <th className="py-2 pr-3">Manzil</th>
                <th className="py-2 pr-3">PM</th>
                <th className="py-2 pr-3">Byudjet</th>
                <th className="py-2 pr-3 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b hover:bg-muted/40">
                  <td className="py-2 pr-3 font-medium">{p.name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{p.location ?? "—"}</td>
                  <td className="py-2 pr-3">{p.pm_name ?? "—"}</td>
                  <td className="py-2 pr-3">{p.total_budget ? Number(p.total_budget).toLocaleString() : "—"}</td>
                  <td className="py-2 pr-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(p)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openCreate && (
        <ProjectDialog
          firms={firms}
          onClose={() => setOpenCreate(false)}
          onSaved={() => { setOpenCreate(false); load(); }}
        />
      )}
      {editing && (
        <ProjectDialog
          firms={firms}
          project={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function ProjectDialog({ project, firms, onClose, onSaved }: {
  project?: Project;
  firms: Firm[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [location, setLocation] = useState(project?.location ?? "");
  const [pmName, setPmName] = useState(project?.pm_name ?? "");
  const [budget, setBudget] = useState<string>(project?.total_budget != null ? String(project.total_budget) : "");
  const [firmId, setFirmId] = useState<string>(project?.firm_id ?? "");
  const [startDate, setStartDate] = useState<string>((project as any)?.start_date ?? "");
  const [endDate, setEndDate] = useState<string>((project as any)?.end_date ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error("Loyiha nomi majburiy");
    if (startDate && endDate && endDate < startDate) return toast.error("Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak");
    setSaving(true);
    const basePayload = {
      name: name.trim(),
      location: location.trim() || null,
      pm_name: pmName.trim() || null,
      total_budget: budget ? Number(budget) : 0,
      firm_id: firmId || null,
      start_date: startDate || null,
      end_date: endDate || null,
    };
    const payload = project
      ? basePayload
      : { ...basePayload, code: `PRJ-${Date.now().toString(36).toUpperCase()}` };

    const { error } = project
      ? await supabase.from("projects").update(payload).eq("id", project.id)
      : await supabase.from("projects").insert(payload as any);

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(project ? "Loyiha yangilandi" : "Loyiha yaratildi");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? "Loyihani tahrirlash" : "Yangi loyiha"}</DialogTitle>
          <DialogDescription>Loyiha ma'lumotlarini kiriting.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Loyiha nomi *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Yunusobod turar-joy" />
          </div>
          <div>
            <Label>Firma</Label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={firmId}
              onChange={(e) => setFirmId(e.target.value)}
            >
              <option value="">— tanlanmagan —</option>
              {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Manzil</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Boshlanish sanasi</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Tugash sanasi</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>PM (loyiha rahbari)</Label>
              <Input value={pmName} onChange={(e) => setPmName(e.target.value)} />
            </div>
            <div>
              <Label>Umumiy byudjet</Label>
              <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
          </div>

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {project ? "Saqlash" : "Yaratish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
