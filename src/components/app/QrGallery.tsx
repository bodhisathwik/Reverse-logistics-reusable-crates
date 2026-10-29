import { useEffect, useState } from "react";
import { useGw } from "@/lib/api";
import { custodyQr } from "@/lib/domain";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inputCls, SkeletonRows } from "@/components/app/kit";
import { CrateLabel, type LabelRow } from "@/components/app/LabelGrid";
import { QrCode } from "@/components/app/QrCode";

type Data = { rows: LabelRow[]; total: number; custodies: { custody_id: string; depot_id: string }[] };

/** Full-screen gallery of a custody's QR + its crate labels, for scanning from a second device. */
export function QrGallery({ open, onOpenChange, preferred }: { open: boolean; onOpenChange: (v: boolean) => void; preferred?: string | undefined }) {
  const [cid, setCid] = useState<string>("");
  const meta = useGw<Data>("/labels", { status: "ISSUED" }, open);
  useEffect(() => {
    if (!open) return;
    if (preferred) setCid(preferred);
    else if (!cid && meta.data?.custodies[0]) setCid(meta.data.custodies[0].custody_id);
  }, [open, preferred, meta.data, cid]);
  const q = useGw<Data>("/labels", { custody_id: cid }, open && !!cid);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass h-[100dvh] max-w-none overflow-y-auto rounded-none p-6 sm:h-[94vh] sm:max-w-[94vw] sm:rounded-2xl">
        <DialogHeader><DialogTitle className="text-2xl">QR codes for scanning</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-4">
          <select className={inputCls + " max-w-xs"} value={cid} onChange={(e) => setCid(e.target.value)}>
            {meta.data?.custodies.map((c) => <option key={c.custody_id} value={c.custody_id}>{c.custody_id} · {c.depot_id}</option>)}
          </select>
          {cid && (
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-white p-1.5"><QrCode text={custodyQr(cid)} size={96} /></div>
              <div><div className="text-xs">Scan this first</div><div className="font-mono font-semibold text-foreground">{custodyQr(cid)}</div></div>
            </div>
          )}
        </div>
        {q.isLoading || !q.data ? <SkeletonRows cols={6} /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {q.data.rows.map((r) => <CrateLabel key={r.id} r={r} size={140} />)}
          </div>
        )}
        {q.data && q.data.total > q.data.rows.length && <p className="text-xs">Showing first {q.data.rows.length} of {q.data.total} crates.</p>}
      </DialogContent>
    </Dialog>
  );
}
