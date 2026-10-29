import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Download, FileDown, Printer } from "lucide-react";
import { toast } from "sonner";
import { useGw } from "@/lib/api";
import { crateQr, custodyQr } from "@/lib/domain";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, inputCls, PageHeader, Pager, Panel, SkeletonRows } from "@/components/app/kit";
import { CrateLabel, type LabelRow } from "@/components/app/LabelGrid";
import { QrCode, qrDataUrl } from "@/components/app/QrCode";

export const Route = createFileRoute("/_authenticated/labels")({
  head: () => ({ meta: [{ title: "Crate Labels · Crate Control Tower" }, { name: "description", content: "Printable QR labels for crates and custodies." }] }),
  component: Labels,
});

type Data = { rows: LabelRow[]; total: number; custodies: { custody_id: string; depot_id: string }[] };

async function downloadSheet(rows: LabelRow[], title: string) {
  const cols = 6, cw = 220, ch = 260, pad = 20;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cw + pad * 2;
  canvas.height = Math.ceil(rows.length / cols) * ch + pad * 2 + 40;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000"; ctx.font = "bold 20px Inter, sans-serif"; ctx.fillText(title, pad, pad + 20);
  await Promise.all(rows.map(async (r, i) => {
    const img = new Image();
    img.src = await qrDataUrl(crateQr(r.id), 360);
    await img.decode();
    const x = pad + (i % cols) * cw, y = pad + 40 + Math.floor(i / cols) * ch;
    ctx.strokeStyle = "#ddd"; ctx.strokeRect(x + 4, y + 4, cw - 8, ch - 8);
    ctx.drawImage(img, x + 25, y + 15, 170, 170);
    ctx.fillStyle = "#000"; ctx.textAlign = "center";
    ctx.font = "600 15px monospace"; ctx.fillText(crateQr(r.id), x + cw / 2, y + 210);
    ctx.font = "13px Inter, sans-serif"; ctx.fillText(`${r.crate_type}${r.depot_id ? " · " + r.depot_id : ""}`, x + cw / 2, y + 232);
    ctx.textAlign = "start";
  }));
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${title.replace(/\W+/g, "-").toLowerCase()}.png`;
  a.click();
}

function Labels() {
  const { role } = useAuth();
  const [filter, setFilter] = useState("issued");
  const [page, setPage] = useState(0);
  const custodyId = filter.startsWith("CUS") ? filter : undefined;
  const q = useGw<Data>("/labels", { page, ...(custodyId ? { custody_id: custodyId } : filter === "available" ? { status: "AVAILABLE" } : filter === "issued" ? { status: "ISSUED" } : {}) }, role === "deliveryAgent");
  if (role !== "deliveryAgent") return (<><PageHeader title="Crate Labels" /><div className="surface-card"><EmptyState title="Agent only" hint="Sign in as a delivery agent to print labels." /></div></>);
  const title = custodyId ? `Labels ${custodyId}` : `Crate labels ${filter}`;
  return (
    <>
      <PageHeader title="Crate Labels" subtitle="QR labels encode CRATE-<id> and CUSTODY-<id>. Print them or show them on a second screen to scan live."
        actions={<div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()}><Printer /> Print labels</Button>
          <Button variant="outline" onClick={() => window.print()} title="Choose 'Save as PDF' in the print dialog"><FileDown /> Download PDF</Button>
          <Button onClick={async () => { if (q.data) { toast.message("Building PNG sheet…"); await downloadSheet(q.data.rows, title); } }} disabled={!q.data?.rows.length}><Download /> Download PNG</Button>
        </div>} />
      <div className="mb-6 max-w-xs print:hidden">
        <select className={inputCls} value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}>
          <option value="issued">Issued crates (all custodies)</option>
          <option value="available">Available crates</option>
          <option value="all">All crates</option>
          {q.data?.custodies.map((c) => <option key={c.custody_id} value={c.custody_id}>Custody {c.custody_id} · {c.depot_id}</option>)}
        </select>
      </div>
      {custodyId && (
        <div className="surface-card mb-6 flex items-center gap-5 p-5 print:border-black">
          <div className="rounded-md bg-white p-1.5"><QrCode text={custodyQr(custodyId)} size={110} /></div>
          <div><div className="text-xs">Scan first to select the custody</div><div className="font-mono text-lg font-semibold text-foreground print:text-black">{custodyQr(custodyId)}</div></div>
        </div>
      )}
      {q.isLoading ? <Panel><SkeletonRows cols={6} /></Panel> : q.error ? <ErrorState error={q.error} /> : !q.data?.rows.length ? <div className="surface-card"><EmptyState title="No crates match" /></div> : (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 print:grid-cols-4">
            {q.data.rows.map((r) => <CrateLabel key={r.id} r={r} />)}
          </motion.div>
          <div className="surface-card mt-4 print:hidden"><Pager page={page} total={q.data.total} onPage={setPage} pageSize={48} /></div>
        </>
      )}
    </>
  );
}

