import { createFileRoute } from "@tanstack/react-router";
import { DavomatPage } from "@/components/DavomatPage";

export const Route = createFileRoute("/davomat")({
  head: () => ({
    meta: [
      { title: "Davomat — QurilishNazorat" },
      { name: "description", content: "Xodimlarning ishga kelish va ketish vaqtlari, lokatsiya, kechikishlar va obyekt chegarasi." },
    ],
  }),
  component: DavomatPage,
});
