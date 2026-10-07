import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrigadesView } from "@/components/BrigadesView";
import { EmployeesView } from "@/components/EmployeesView";
import { DavomatPage } from "@/components/DavomatPage";
import { useActiveProject } from "@/lib/project-context";

type Tab = "employees" | "brigades" | "davomat";

export const Route = createFileRoute("/brigade-balance")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => {
    const t = search.tab;
    return { tab: t === "brigades" || t === "davomat" || t === "employees" ? t : undefined };
  },
  head: () => ({
    meta: [
      { title: "HR — Innosite" },
      { name: "description", content: "Xodimlar, brigadalar va davomat boshqaruvi." },
      { property: "og:title", content: "HR — Innosite" },
      { property: "og:description", content: "Xodimlar, brigadalar va davomat boshqaruvi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { activeProject } = useActiveProject();
  const search = Route.useSearch();
  const initial: Tab = search.tab ?? "employees";
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="HR"
        subtitle={activeProject ? `${activeProject.name} — xodimlar, brigadalar va davomat.` : "Loyiha tanlang."}
      />
      <>
        <Tabs key={initial} defaultValue={initial} className="w-full">
          <TabsList className="flex w-full max-w-full overflow-x-auto no-scrollbar h-auto justify-start">
            <TabsTrigger value="employees">Xodimlar</TabsTrigger>
            <TabsTrigger value="brigades">Brigadalar</TabsTrigger>
            <TabsTrigger value="davomat">Davomat</TabsTrigger>
          </TabsList>
          <TabsContent value="employees" className="mt-4"><EmployeesView /></TabsContent>
          <TabsContent value="brigades" className="mt-4"><BrigadesView /></TabsContent>
          <TabsContent value="davomat" className="mt-4 -mx-4 sm:-mx-6"><DavomatPage /></TabsContent>
        </Tabs>
      </>
    </div>
  );
}
