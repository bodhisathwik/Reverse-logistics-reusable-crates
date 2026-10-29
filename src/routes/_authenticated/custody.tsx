import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, Loader2, ScanLine, X } from "lucide-react";
import { crateQr, normalizeScan } from "@/lib/domain";
import { ScannerFallback } from "@/components/app/ScanReturns";
import type { ScanOutcome } from "@/components/app/CrateScanner";

const CrateScanner = lazy(() => import("@/components/app/CrateScanner"));
import { toast } from "sonner";
import { useGateway, useGw } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Field, inputCls, PageHeader, Pager, Panel, SkeletonRows, StatusBadge, Table } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/custody")({
  head: () => ({ meta: [{ title: "Custody · Crate Control Tower" }, { name: "description", content: "Issue and track crate custody." }] }),
  component: CustodyPage,
});

export type Meta = { depots: { id: string; name: string }[]; agents: { id: string; name: string }[]; types: { code: string; label: string }[] };
type Rows = { rows: { custody_id: string; depot_id: string; delivery_agent: string; crate_type: string; issued_qty: number; returned_qty: number; status: string; issue_date: string; due_date: string; overdue: boolean }[]; total: number };

function CustodyPage() {
  const { role } = useAuth();
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const q = useGw<Rows>("/custody", { page });
  return (
    <>
      <PageHeader title="Custody" subtitle="Crates issued to depots. Custody only closes when every crate is back."
        actions={role === "deliveryAgent" && <Button onClick={() => setOpen(true)}><Plus /> Issue custody</Button>} />
      <Panel>
        {q.isLoading ? <SkeletonRows cols={7} /> : q.error ? <ErrorState error={q.error} /> : !q.data?.rows.length ? <EmptyState title="No custody yet" hint="Issue crates to a depot to get started." /> : (
          <>
            <Table head={["Custody", "Depot", "Agent", "Type", "Issued", "Returned", "Outstanding", "Due", "Status"]}>
              {q.data.rows.map((r) => (
                <tr key={r.custody_id}>
                  <td className="font-mono text-xs text-foreground">{r.custody_id}</td>
                  <td>{r.depot_id}</td><td>{r.delivery_agent}</td><td>{r.crate_type}</td>
                  <td className="tabular-nums">{r.issued_qty}</td><td className="tabular-nums text-success">{r.returned_qty}</td>
                  <td className="tabular-nums font-semibold text-foreground">{r.issued_qty - r.returned_qty}</td>
                  <td>{r.due_date}</td>
                  <td className="flex gap-1.5"><StatusBadge status={r.status} />{r.overdue && <StatusBadge status="OVERDUE" />}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} total={q.data.total} onPage={setPage} />
          </>
        )}
      </Panel>
      <IssueDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function IssueDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const meta = useGw<Meta>("/meta");
  const call = useGateway();
  const qc = useQueryClient();
  const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const [f, setF] = useState({ depot_id: "DEP-001", agent_id: "AGT-01", crate_type: "BLUE40", qty: 20, due_date: due });
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [verify, setVerify] = useState(false);
  const [verified, setVerified] = useState<string[]>([]);
  const avail = useGw<{ rows: { id: string; crate_type: string }[] }>("/labels", { status: "AVAILABLE" }, verify);
  async function onScan(raw: string): Promise<ScanOutcome> {
    const c = normalizeScan(raw);
    if (c.kind === "crate" && verified.includes(c.id)) { toast.warning(`Already scanned · ${c.id}`); return "dup"; }
    const r = await call<{ valid: boolean; message?: string; crateId?: string }>("POST", "/assets/verify", { code: raw, crate_type: f.crate_type });
    if (!r.ok) { toast.error(`${r.status} · ${r.error}`); return "error"; }
    if (!r.data!.valid) { toast.error(r.data!.message ?? "Rejected", { description: c.id }); return "error"; }
    setVerified((v) => [r.data!.crateId!, ...v]);
    return "ok";
  }
  function simulate() {
    const n = avail.data?.rows.find((x) => x.crate_type === f.crate_type && !verified.includes(x.id));
    return n ? crateQr(n.id) : null;
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = verified.length ? { ...f, qty: verified.length, crate_ids: verified } : f;
    const r = await call<{ custodyId: string }>("POST", "/custody/issue", body);
    setBusy(false);
    if (r.ok) {
      toast.success(`Custody ${r.data!.custodyId} issued`, { description: `${f.qty} × ${f.crate_type} → ${f.depot_id}` });
      qc.invalidateQueries({ queryKey: ["gw"] });
      setVerified([]);
      onOpenChange(false);
    } else { setShake((s) => s + 1); toast.error(`${r.status} · ${r.error}`); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader><DialogTitle>Issue crate custody</DialogTitle></DialogHeader>
        <motion.form key={shake} animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.4 }} onSubmit={submit} className="space-y-4">
          <Field label="Depot"><select className={inputCls} value={f.depot_id} onChange={(e) => setF({ ...f, depot_id: e.target.value })}>{meta.data?.depots.map((d) => <option key={d.id} value={d.id}>{d.id} · {d.name}</option>)}</select></Field>
          <Field label="Delivery agent"><select className={inputCls} value={f.agent_id} onChange={(e) => setF({ ...f, agent_id: e.target.value })}>{meta.data?.agents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Crate type"><select className={inputCls} value={f.crate_type} onChange={(e) => { setF({ ...f, crate_type: e.target.value }); setVerified([]); }}>{meta.data?.types.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}</select></Field>
            <Field label="Quantity"><input type="number" min={1} max={300} className={inputCls} value={verified.length || f.qty} disabled={verified.length > 0} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Due date"><input type="date" className={inputCls} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
          <div className="surface-panel p-3">
            <button type="button" className="flex w-full items-center justify-between text-sm text-foreground" onClick={() => setVerify((v) => !v)}>
              <span className="flex items-center gap-2"><ScanLine className="size-4 text-primary" /> Verify crates by scanning (optional)</span>
              <span className="text-xs">{verified.length ? `${verified.length} verified` : verify ? "Hide" : "Show"}</span>
            </button>
            {verify && (
              <div className="mt-3 space-y-3">
                <Suspense fallback={<ScannerFallback />}><CrateScanner onScan={onScan} onSimulate={simulate} /></Suspense>
                {verified.length > 0 && (
                  <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                    {verified.map((id) => (
                      <button type="button" key={id} onClick={() => setVerified((v) => v.filter((x) => x !== id))} className="flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 font-mono text-[11px] text-success">
                        {id} <X className="size-3" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Issue via gateway</Button>
        </motion.form>
      </DialogContent>
    </Dialog>
  );
}
