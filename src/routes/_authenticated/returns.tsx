import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { useGateway, useGw } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { EmptyState, Field, inputCls, PageHeader, Panel, StatusBadge } from "@/components/app/kit";
import { ScanReturns } from "@/components/app/ScanReturns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/returns")({
  head: () => ({ meta: [{ title: "Return Scans · Crate Control Tower" }, { name: "description", content: "Collect crate return scans." }] }),
  component: Returns,
});

type Rows = { rows: { custody_id: string; depot_id: string; crate_type: string; issued_qty: number; returned_qty: number; status: string }[]; total: number };
type Res = { custodyId: string; returnedQty: number; outstandingQty: number; status: string; eventOffset: number; consumerSkipped: boolean };

function Returns() {
  const { role } = useAuth();
  const open = useGw<Rows>("/custody", { open: true });
  const call = useGateway();
  const qc = useQueryClient();
  const [cid, setCid] = useState("");
  const [qty, setQty] = useState(1);
  const [ids, setIds] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; key: number; text: string; res?: Res } | null>(null);
  const sel = open.data?.rows.find((r) => r.custody_id === cid);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const crate_ids = ids.split(/[\s,]+/).filter(Boolean);
    const r = await call<Res>("POST", "/custody/return", { custody_id: cid, qty, crate_ids });
    setBusy(false);
    if (r.ok) {
      setResult({ ok: true, key: Date.now(), text: `Outstanding ${r.data!.outstandingQty}`, res: r.data });
      toast.success(`Scan recorded · event #${r.data!.eventOffset} published`);
      qc.invalidateQueries({ queryKey: ["gw"] });
      setIds("");
    } else {
      setResult({ ok: false, key: Date.now(), text: `${r.status} · ${r.error}` });
      toast.error(`${r.status} · ${r.error}`);
    }
  }

  return (
    <>
      <PageHeader title="Return Scans" subtitle="Scan crate IDs or enter a quantity. Each scan publishes CrateReturned to the event bus." />
      <Tabs defaultValue="camera">
        <TabsList className="mb-6 bg-surface-2">
          <TabsTrigger value="camera">Camera scan</TabsTrigger>
          <TabsTrigger value="qty">Quantity entry</TabsTrigger>
        </TabsList>
        <TabsContent value="camera"><ScanReturns /></TabsContent>
        <TabsContent value="qty">
      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="Collect scan" className="lg:col-span-3">
          {role !== "deliveryAgent" ? <EmptyState title="Read-only role" hint="Only delivery agents can collect return scans. Calls from this role are denied with 403 by the gateway." /> : (
            <form onSubmit={submit} className="space-y-4 p-5">
              <Field label="Custody">
                <select className={inputCls} value={cid} onChange={(e) => setCid(e.target.value)} required>
                  <option value="">Select open custody…</option>
                  {open.data?.rows.map((r) => <option key={r.custody_id} value={r.custody_id}>{r.custody_id} · {r.depot_id} · {r.issued_qty - r.returned_qty} out</option>)}
                </select>
              </Field>
              {sel && (
                <div className="surface-panel grid grid-cols-3 gap-2 p-3 text-center text-xs">
                  <div><div className="text-lg font-bold text-foreground">{sel.issued_qty}</div>issued</div>
                  <div><div className="text-lg font-bold text-success">{sel.returned_qty}</div>returned</div>
                  <div><div className="text-lg font-bold text-warning">{sel.issued_qty - sel.returned_qty}</div>outstanding</div>
                </div>
              )}
              <Field label="Quantity returned"><input type="number" min={1} className={inputCls} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field>
              <Field label="Scanned crate IDs (optional)"><textarea className={inputCls + " h-20 py-2"} placeholder="B40-0001, B40-0002…" value={ids} onChange={(e) => setIds(e.target.value)} /></Field>
              <Button type="submit" size="lg" className="w-full" disabled={busy || !cid}>{busy ? <Loader2 className="animate-spin" /> : <ScanLine />} Submit scan</Button>
            </form>
          )}
        </Panel>
        <Panel title="Result" className="lg:col-span-2">
          <div className="flex min-h-64 items-center justify-center p-6">
            <AnimatePresence mode="wait">
              {!result ? <motion.div key="idle" exit={{ opacity: 0 }} className="text-sm">Waiting for a scan…</motion.div> : result.ok ? (
                <motion.div key={result.key} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
                  <svg viewBox="0 0 52 52" className="mx-auto size-20">
                    <circle cx="26" cy="26" r="24" fill="none" stroke="var(--success)" strokeOpacity="0.25" strokeWidth="3" />
                    <motion.path d="M15 27 l7 7 l15 -15" fill="none" stroke="var(--success)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.1 }} />
                  </svg>
                  <div className="mt-4 text-2xl font-bold text-foreground">{result.text}</div>
                  <div className="mt-2 flex justify-center"><StatusBadge status={result.res!.status} /></div>
                  <div className="mt-3 text-xs">Event offset #{result.res!.eventOffset}{result.res!.consumerSkipped && " · consumer DOWN, queued"}</div>
                </motion.div>
              ) : (
                <motion.div key={result.key} initial={{ opacity: 0 }} animate={{ opacity: 1, x: [0, -10, 10, -6, 6, 0] }} transition={{ duration: 0.45 }}
                  className="w-full rounded-xl border border-danger/40 bg-danger/10 p-5 text-center text-sm font-medium text-danger">
                  {result.text}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Panel>
      </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
