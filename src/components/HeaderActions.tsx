import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, FileText, Loader2, Settings } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { useCurrentRoles } from "@/hooks/use-current-roles";
import { useActiveProject } from "@/lib/project-context";

const btnCls =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground transition hover:border-primary hover:text-primary";

export function HeaderActions() {
  const { roles } = useCurrentRoles();
  const { activeProjectId, activeProject } = useActiveProject();
  const qc = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [pdfing, setPdfing] = useState(false);
  const isAdmin = roles.includes("admin");
  const canPdf = roles.some((r) => ["admin", "ceo", "finans"].includes(r));

  const handlePdf = async () => {
    if (!activeProjectId) {
      toast.error("Avval loyihani tanlang");
      return;
    }
    setPdfing(true);
    const tid = toast.loading("PDF hisobot tayyorlanmoqda…");
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { buildCeoReport } = await import("@/lib/ceo-report-data");
      const { renderCeoReportPdf, ceoReportFileName } = await import("@/lib/ceo-report-pdf");
      const report = await buildCeoReport(supabase, activeProjectId);
      const bytes = await renderCeoReportPdf(report);
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([ab], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = ceoReportFileName(report);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("PDF hisobot yuklab olindi", { id: tid });
    } catch (e: any) {
      toast.error(`PDF xatosi: ${e?.message ?? e}`, { id: tid });
    } finally {
      setPdfing(false);
    }
  };


  const handleExport = async () => {
    setExporting(true);
    const tid = toast.loading("Excel hisobot tayyorlanmoqda…");
    try {
      const { exportDashboardExcel } = await import("@/lib/dashboard-excel");
      await exportDashboardExcel({
        projectId: activeProjectId ?? null,
        projectName: activeProject?.name ?? "Barcha loyihalar",
      });
      qc.invalidateQueries();
      toast.success("Excel hisobot yuklab olindi", { id: tid });
    } catch (e: any) {
      toast.error(`Eksport xatosi: ${e?.message ?? e}`, { id: tid });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {canPdf && (
        <button
          type="button"
          onClick={handlePdf}
          disabled={pdfing}
          aria-label="PDF hisobot"
          title="Bir betlik PDF hisobot"
          className={btnCls}
        >
          {pdfing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        </button>
      )}
      <button

        type="button"
        onClick={handleExport}
        disabled={exporting}
        aria-label="Excelga yuklab olish"
        title="Excelga yuklab olish"
        className={btnCls}
      >
        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
      {isAdmin && (
        <Link to="/settings" aria-label="Sozlamalar" title="Sozlamalar" className={btnCls}>
          <Settings className="h-4 w-4" />
        </Link>
      )}
    </>
  );
}
