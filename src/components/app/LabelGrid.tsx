import { memo } from "react";
import { QrCode } from "@/components/app/QrCode";
import { crateQr } from "@/lib/domain";

export type LabelRow = { id: string; crate_type: string; status: string; holder_ref: string | null; depot_id: string | null };

const TYPE_LABEL: Record<string, string> = { BLUE40: "Blue 40L", GREEN25: "Green 25L" };

export const CrateLabel = memo(function CrateLabel({ r, size = 120 }: { r: LabelRow; size?: number }) {
  return (
    <div className="label-card flex flex-col items-center gap-2 rounded-xl border bg-surface-1 p-3 text-center print:break-inside-avoid print:border-black print:bg-white">
      <div className="rounded-md bg-white p-1.5"><QrCode text={crateQr(r.id)} size={size} /></div>
      <div className="font-mono text-sm font-semibold text-foreground print:text-black">{crateQr(r.id)}</div>
      <div className="text-[11px] print:text-black">{TYPE_LABEL[r.crate_type] ?? r.crate_type}{r.depot_id ? ` · ${r.depot_id}` : ""}</div>
    </div>
  );
});
