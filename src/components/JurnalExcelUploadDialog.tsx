import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSpreadsheet, Upload } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { parseJurnalEntry } from "@/lib/jurnal-ai.functions";
import { startJurnalExcelUpload, isJurnalExcelUploadRunning } from "@/lib/jurnal-excel-runner";

export function JurnalExcelUploadDialog({ projectId, disabled }: { projectId: string | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const qc = useQueryClient();
  const parseFn = useServerFn(parseJurnalEntry);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !projectId) return;
    // Background'da ishga tushiramiz — sahifa o'zgarsa ham to'xtamaydi
    void startJurnalExcelUpload({ projectId, file: f, parseFn, qc });
    setOpen(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={disabled || !projectId}>
        <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel yuklash
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Jurnalga Excel yuklash
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Chalkash Excel/CSV faylni yuklang — AI har bir qatorni avtomatik aniqlaydi (material, ish, xarajat yoki kirim) va reja bilan moslaydi.
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            💡 Fayl tanlagandan so'ng yuklash <b>fon rejimida</b> davom etadi. Boshqa sahifaga o'tsangiz ham to'xtamaydi — progress toast orqali ko'rinadi.
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onFile}
          />
          <Button className="w-full" onClick={() => fileRef.current?.click()} disabled={isJurnalExcelUploadRunning()}>
            <Upload className="mr-2 h-4 w-4" />
            {isJurnalExcelUploadRunning() ? "Boshqa yuklash davom etmoqda…" : "Fayl tanlash va yuklashni boshlash"}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Yopish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
