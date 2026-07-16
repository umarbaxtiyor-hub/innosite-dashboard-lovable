import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useActiveProject } from "@/lib/project-context";
import { ProcurementWorkflow } from "@/components/ProcurementWorkflow";

export const Route = createFileRoute("/taminot")({
  head: () => ({
    meta: [
      { title: "Ta'minot — QurilishNazorat" },
      { name: "description", content: "Loyiha bo'yicha ta'minot (procurement) jarayoni: zayavka, buyurtma, yetkazib berish va to'lov." },
    ],
  }),
  component: TaminotPage,
});

function TaminotPage() {
  const { activeProjectId } = useActiveProject();
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Ta'minot" subtitle="Buyurtma → Yetkazib berish → To'lov jarayoni" />
      {!activeProjectId ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          Yuqori o'ng burchakdan loyiha tanlang.
        </div>
      ) : (
        <ProcurementWorkflow projectId={activeProjectId} />
      )}
    </div>
  );
}
