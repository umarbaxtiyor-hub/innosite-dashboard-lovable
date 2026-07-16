export type Kind = "material" | "work" | "equipment";

export type Z = {
  id: string; project_id: string; kind: Kind; name: string; unit: string;
  qty: number; unit_price: number; total: number;
  status: "approved" | "pending"; notes: string | null; off_plan?: boolean;
};
