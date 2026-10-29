import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, PackageCheck, Undo2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useGateway, useGw } from "@/lib/api";
import { crateQr, normalizeScan } from "@/lib/domain";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, Field, inputCls, Panel, StatusBadge } from "@/components/app/kit";
import type { ScanOutcome } from "@/components/app/CrateScanner";

const CrateScanner = lazy(() => import("@/components/app/CrateScanner"));

type OpenRows = { rows: { custody_id: string; depot_id: string; issued_qty: number; returned_qty: number }[] };
type Info = { custody: { custody_id: string; depot_id: string; crate_type: string; issued_qty: number; returned_qty: number; status: string }; crates: string[] };
type Res = { custodyId: string; returnedQty: number; outstandingQty: number; status: string; eventOffset: number };

export function ScannerFallback() {
  return <div className="shimmer aspect-square w-full rounded-2xl sm:aspect-[4/3]" />;
}

export function ScanReturns() {
  const { role } = useAuth();
  const call = useGateway();
  const qc = useQueryClient();
  const open = useGw<OpenRows>("/custody", { open: true }, role === "deliveryAgent");
  const [cid, setCid] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [scanned, setScanned] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Res | null>(null);
  const [sheet, setSheet] = useState(false);

  const load = useCallback(async (id: string) => {
    setInfo(null);
    if (!id) return;
    const r = await call<Info>("GET", "/custody/crates", { custody_id: id });
    if (r.ok) setInfo(r.data!); else toast.error(`${r.status} · ${r.error}`);
  }, [call]);
  useEffect(() => { setScanned([]); setResult(null); void load(cid); }, [cid, load]);

  const issued = info?.custody.issued_qty ?? 0;
  const already = info?.custody.returned_qty ?? 0;
  const returnedNow = already + scanned.length;
  const outstanding = Math.max(0, issued - returnedNow);
  const pct = issued ? returnedNow / issued : 0;

  const onScan = useCallback(async (raw: string): Promise<ScanOutcome> => {
    const code = normalizeScan(raw);
    if (code.kind === "custody") {
      if (open.data?.rows.some((r) => r.custody_id === code.id)) { setCid(code.id); toast.success(`Custody ${code.id} selected`); return "ok"; }
      toast.error("Custody not open or unknown"); return "error";
    }
    if (!cid) { toast.error("Select or scan a custody first"); return "error"; }
    if (code.kind !== "crate") { toast.error(`Unknown code: ${code.id}`); return "error"; }
    if (scanned.includes(code.id)) { toast.warning(`Already scanned · ${code.id}`); return "dup"; }
    const r = await call<{ valid: boolean; message?: string; crateId?: string }>("POST", "/custody/verify", { custody_id: cid, code: raw });
    if (!r.ok) { toast.error(`${r.status} · ${r.error}`); return "error"; }
    if (!r.data!.valid) { toast.error(r.data!.message ?? "Rejected", { description: code.id }); return "error"; }
    setScanned((s) => (s.includes(code.id) ? s : [code.id, ...s]));
    return "ok";
  }, [cid, scanned, call, open.data]);

  const simulate = useCallback(() => {
    const next = info?.crates.find((c) => !scanned.includes(c));
    if (!next) { toast.message(cid ? "All crates in this custody are scanned" : "Select a custody first"); return null; }
    return crateQr(next);
  }, [info, scanned, cid]);

  async function submit() {
    if (!cid || !scanned.length) return;
    setBusy(true);
    const r = await call<Res>("POST", "/custody/return", { custody_id: cid, crate_ids: scanned, qty: scanned.length });
    setBusy(false);
    if (r.ok) {
      setResult(r.data!);
      setScanned([]);
      toast.success(`${r.data!.returnedQty} / ${issued} returned · event #${r.data!.eventOffset}`);
      qc.invalidateQueries({ queryKey: ["gw"] });
      setSheet(false);
      void load(cid);
    } else toast.error(`${r.status} · ${r.error}`);
  }

  async function tryLocked() {
    const r = await call("POST", "/custody/verify", { custody_id: "CUS-1002", code: "CRATE-G25-0001" });
    toast.error(`${r.status} · ${r.error ?? "Denied"}`, { description: "Logged in the Gateway Log" });
  }

  const list = useMemo(() => (
    <ScannedList scanned={scanned} onUndo={(id) => setScanned((s) => s.filter((x) => x !== id))}
      returnedNow={returnedNow} issued={issued} outstanding={outstanding} busy={busy} onSubmit={submit} />
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [scanned, returnedNow, issued, outstanding, busy, cid]);

  if (role !== "deliveryAgent") {
    return (
      <Panel>
        <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-warning/12 text-warning"><Lock className="size-6" /></div>
          <div className="font-semibold text-foreground">Scanner locked</div>
          <p className="max-w-sm text-sm">Only delivery agents can scan returns. Any attempt from this role is denied with 403 by the gateway.</p>
          <Button variant="outline" onClick={tryLocked}>Try anyway</Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Panel>
          <div className="space-y-4 p-4 sm:p-5">
            <Field label="Custody (or scan its CUSTODY QR)">
              <select className={inputCls} value={cid} onChange={(e) => setCid(e.target.value)}>
                <option value="">Select open custody…</option>
                {open.data?.rows.map((r) => <option key={r.custody_id} value={r.custody_id}>{r.custody_id} · {r.depot_id} · {r.issued_qty - r.returned_qty} out</option>)}
              </select>
            </Field>
            {info && (
              <div className="flex items-center gap-5">
                <ProgressRing pct={pct} />
                <div className="grid flex-1 grid-cols-3 gap-2 text-center text-xs">
                  <div><div className="text-2xl font-bold tabular-nums text-foreground">{issued}</div>issued</div>
                  <div><div className="text-2xl font-bold tabular-nums text-success">{returnedNow}</div>returned</div>
                  <div><motion.div key={outstanding} initial={{ scale: 1.2, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} className="text-2xl font-bold tabular-nums text-warning">{outstanding}</motion.div>outstanding</div>
                </div>
              </div>
            )}
            <Suspense fallback={<ScannerFallback />}>
              <CrateScanner onScan={onScan} onSimulate={simulate} />
            </Suspense>
          </div>
        </Panel>
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="surface-card flex flex-wrap items-center gap-4 p-5">
              <PackageCheck className="size-6 text-success" />
              <div className="flex-1">
                <div className="font-semibold text-foreground">{result.returnedQty} / {issued} returned · {result.outstandingQty} outstanding retained</div>
                <div className="text-xs">CrateReturned published at offset #{result.eventOffset}</div>
              </div>
              <StatusBadge status={result.status} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="hidden lg:col-span-2 lg:block">
        <Panel title="Scanned crates" className="sticky top-24">{list}</Panel>
      </div>

      {/* Phone: counter bar that opens the list as a bottom sheet */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface-1 p-3 lg:hidden">
        <Button className="w-full" size="lg" onClick={() => setSheet(true)} disabled={!cid}>
          <ListChecks /> {scanned.length} scanned · {returnedNow} / {issued || "—"} returned
        </Button>
      </div>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl bg-surface-1 p-0">
          <SheetHeader className="px-5 pt-5"><SheetTitle>Scanned crates</SheetTitle></SheetHeader>
          {list}
        </SheetContent>
      </Sheet>
      <div className="h-16 lg:hidden" />
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="6" />
      <motion.circle cx="32" cy="32" r={r} fill="none" stroke={pct >= 1 ? "var(--success)" : "var(--primary)"} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - Math.min(1, pct)) }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
    </svg>
  );
}

function ScannedList({ scanned, onUndo, returnedNow, issued, outstanding, busy, onSubmit }: {
  scanned: string[]; onUndo: (id: string) => void; returnedNow: number; issued: number; outstanding: number; busy: boolean; onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between px-5 py-4">
        <span className="text-3xl font-bold tabular-nums text-foreground">{returnedNow} <span className="text-base font-medium text-muted-foreground">/ {issued || "—"} returned</span></span>
        <span className="text-sm text-warning">{outstanding} out</span>
      </div>
      <div className="max-h-[45vh] overflow-y-auto border-y">
        {!scanned.length ? <EmptyState title="No crates scanned yet" hint="Scan crate labels — each one appears here." /> : (
          <ul>
            <AnimatePresence initial={false}>
              {scanned.map((id) => (
                <motion.li key={id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center justify-between border-b px-5 py-2.5 text-sm last:border-0">
                  <span className="font-mono text-foreground">{id}</span>
                  <Button variant="ghost" size="sm" onClick={() => onUndo(id)} aria-label={`Remove ${id}`}><Undo2 /> Undo</Button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
      <div className="p-4">
        <Button className="w-full" size="lg" disabled={busy || !scanned.length} onClick={onSubmit}>
          {busy ? <Loader2 className="animate-spin" /> : <PackageCheck />} Submit Returns ({scanned.length})
        </Button>
        {scanned.length > 0 && outstanding > 0 && <p className="mt-2 text-center text-xs">Will stay PARTIALLY_RETURNED with {outstanding} outstanding.</p>}
      </div>
    </div>
  );
}
