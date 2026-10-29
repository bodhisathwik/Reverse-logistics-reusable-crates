import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Play, QrCode as QrIcon, RotateCcw } from "lucide-react";
import { QrGallery } from "@/components/app/QrGallery";
import { toast } from "sonner";
import { useGateway } from "@/lib/api";
import { demoDepotDenied, ensureDemoUser, runTestSuite } from "@/lib/gateway.functions";
import { emitFlow } from "@/lib/flow";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, JsonView, PageHeader, Panel, StatusBadge } from "@/components/app/kit";
import { TestResults } from "@/components/app/TestResults";
import type { TestResult } from "@/lib/tests.types";

export const Route = createFileRoute("/_authenticated/demo")({
  validateSearch: (s: Record<string, unknown>): { step?: number } => {
    const n = Number(s.step);
    return Number.isInteger(n) && n >= 1 && n <= 7 ? { step: n } : {};
  },
  head: () => ({ meta: [{ title: "Demo Mode · Crate Control Tower" }, { name: "description", content: "Guided end-to-end demo runner." }] }),
  component: Demo,
});

const STEPS = [
  { t: "Seed synthetic records", d: "3 depots, 2 agents, 2 crate types, 600 crates, several custodies." },
  { t: "Normal workflow via Gateway", d: "Issue 30 Blue crates, return all 30 → balance cleared, custody CLOSED." },
  { t: "Short-return scenario", d: "Issue 50, return 42 → custody stays open with 8 outstanding." },
  { t: "Inspect the Kafka event", d: "The CrateReturned message on soa.s06.t06.events with its offset." },
  { t: "Downstream ReturnBalance state", d: "What the consumer persisted in its own store." },
  { t: "403 for customerDepot JWT", d: "A depot token attempts an agent-only action." },
  { t: "Run the test suite", d: "Domain, integration, persistence, contract, security." },
];

type Out = { ok: boolean; node: ReactNode };

function Demo() {
  const { step } = Route.useSearch();
  const { role } = useAuth();
  const call = useGateway();
  const qc = useQueryClient();
  const denied = useServerFn(demoDepotDenied);
  const ensure = useServerFn(ensureDemoUser);
  const tests = useServerFn(runTestSuite);
  const [active, setActive] = useState(0);
  const [done, setDone] = useState<boolean[]>(Array(7).fill(false));
  const [outs, setOuts] = useState<(Out | null)[]>(Array(7).fill(null));
  const [busy, setBusy] = useState(false);
  const [gallery, setGallery] = useState(false);
  const shortRef = useRef<{ custodyId: string; event: unknown; offset: number } | null>(null);

  const due = () => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

  async function exec(i: number): Promise<Out> {
    switch (i) {
      case 0: {
        const r = await call("POST", "/admin/seed");
        if (!r.ok) throw new Error(`${r.status} · ${r.error}`);
        return { ok: true, node: <p className="text-sm">Database reset and seeded. 6 custodies across 3 depots, crates registered, balances reconciled.</p> };
      }
      case 1: {
        const a = await call<{ custodyId: string }>("POST", "/custody/issue", { depot_id: "DEP-002", agent_id: "AGT-02", crate_type: "BLUE40", qty: 30, due_date: due() });
        if (!a.ok) throw new Error(`${a.status} · ${a.error}`);
        const b = await call<{ outstandingQty: number; status: string }>("POST", "/custody/return", { custody_id: a.data!.custodyId, qty: 30 });
        if (!b.ok) throw new Error(`${b.status} · ${b.error}`);
        return { ok: true, node: <Kv rows={[["Custody", a.data!.custodyId], ["Issued", "30"], ["Returned", "30"], ["Outstanding", String(b.data!.outstandingQty)], ["Status", <StatusBadge key="s" status={b.data!.status} />]]} /> };
      }
      case 2: {
        const a = await call<{ custodyId: string }>("POST", "/custody/issue", { depot_id: "DEP-001", agent_id: "AGT-01", crate_type: "GREEN25", qty: 50, due_date: due() });
        if (!a.ok) throw new Error(`${a.status} · ${a.error}`);
        const b = await call<{ outstandingQty: number; status: string; event: unknown; eventOffset: number }>("POST", "/custody/return", { custody_id: a.data!.custodyId, qty: 42 });
        if (!b.ok) throw new Error(`${b.status} · ${b.error}`);
        shortRef.current = { custodyId: a.data!.custodyId, event: b.data!.event, offset: b.data!.eventOffset };
        return { ok: true, node: (
          <div>
            <div className="flex items-end gap-3"><span className="text-5xl font-bold tracking-tight text-warning">8</span><span className="pb-2 text-sm">outstanding retained — custody NOT closed</span></div>
            <div className="mt-3"><Kv rows={[["Custody", a.data!.custodyId], ["Issued", "50"], ["Returned", "42"], ["Status", <StatusBadge key="s" status={b.data!.status} />]]} /></div>
          </div>
        ) };
      }
      case 3: {
        if (!shortRef.current) throw new Error("Run step 3 first");
        return { ok: true, node: <div><div className="mb-2 text-sm">Topic <span className="font-mono text-warning">soa.s06.t06.events</span> · offset <b className="text-foreground">#{shortRef.current.offset}</b> · key {shortRef.current.custodyId}</div><JsonView value={shortRef.current.event} /></div> };
      }
      case 4: {
        if (!shortRef.current) throw new Error("Run step 3 first");
        const r = await call<{ rows: { custody_id: string }[] }>("GET", "/balances/custody", {});
        const d = await call<{ rows: { depot_id: string }[] }>("GET", "/balances", {});
        const row = r.data?.rows.find((x) => x.custody_id === shortRef.current!.custodyId);
        const dep = d.data?.rows.find((x) => x.depot_id === "DEP-001");
        return { ok: !!row, node: <div className="grid gap-3 md:grid-cols-2"><div><div className="mb-1 font-mono text-xs">balance_custody</div><JsonView value={row} /></div><div><div className="mb-1 font-mono text-xs">balance_depot</div><JsonView value={dep} /></div></div> };
      }
      case 5: {
        await ensure({ data: { role: "customerDepot" } });
        const r = await denied();
        emitFlow("deny");
        const ok = r.response.status === 403;
        return { ok, node: (
          <motion.div animate={{ x: [0, -8, 8, -5, 5, 0] }} transition={{ duration: 0.45 }}>
            <div className="mb-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm font-semibold text-danger">HTTP {r.response.status} · {r.response.error}</div>
            <div className="mb-1 text-xs">JWT claims used:</div><JsonView value={r.claims} />
          </motion.div>
        ) };
      }
      case 6: {
        const r = (await tests()) as TestResult[];
        return { ok: r.every((x) => x.passed), node: <TestResults results={r} /> };
      }
    }
    throw new Error("Unknown step");
  }

  async function run(i: number) {
    setBusy(true);
    setActive(i);
    try {
      const o = await exec(i);
      setOuts((s) => s.map((x, j) => (j === i ? o : x)));
      setDone((s) => s.map((x, j) => (j === i ? true : x)));
      toast[o.ok ? "success" : "error"](`Step ${i + 1}: ${STEPS[i].t}`);
      if (i < 6) setActive(i + 1);
    } catch (e) {
      setOuts((s) => s.map((x, j) => (j === i ? { ok: false, node: <div className="text-sm text-danger">{(e as Error).message}</div> } : x)));
      toast.error((e as Error).message);
    }
    qc.invalidateQueries({ queryKey: ["gw"] });
    setBusy(false);
  }

  useEffect(() => { if (step && role === "deliveryAgent") run(step - 1); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, role]);

  const progress = done.filter(Boolean).length / 7;

  if (role !== "deliveryAgent") return (<><PageHeader title="Demo Mode" /><div className="surface-card"><EmptyState title="Agent only" hint="Sign in as a delivery agent to run the guided demo." /></div></>);

  return (
    <>
      <PageHeader title="Demo Mode" subtitle="A guided run through the whole architecture. Press Next on each step."
        actions={<>
          <Button variant="outline" onClick={() => setGallery(true)}><QrIcon /> Show QR codes for scanning</Button>
          <Button variant="outline" onClick={() => { setDone(Array(7).fill(false)); setOuts(Array(7).fill(null)); setActive(0); }}><RotateCcw /> Reset</Button>
        </>} />
      <QrGallery open={gallery} onOpenChange={setGallery} preferred={shortRef.current?.custodyId} />
      <div className="mb-8 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <motion.div className="h-full origin-left bg-gradient-primary" initial={false} animate={{ scaleX: progress }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
      </div>
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={i}>
            <Panel className={cn(i === active && "border-primary/40")}>
              <div className="flex items-center gap-4 p-5">
                <div className={cn("relative grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold", done[i] ? "bg-success/15 text-success" : i === active ? "bg-primary/15 text-primary" : "bg-surface-3")}>
                  <AnimatePresence mode="wait">
                    {done[i] ? <motion.span key="c" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 15 }}><Check className="size-4" /></motion.span> : <motion.span key="n">{i + 1}</motion.span>}
                  </AnimatePresence>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground">{s.t}</div>
                  <div className="text-sm">{s.d}</div>
                </div>
                <Button variant={i === active ? "default" : "outline"} size="sm" disabled={busy} onClick={() => run(i)}>
                  {busy && active === i ? <Loader2 className="animate-spin" /> : <Play />} {done[i] ? "Re-run" : "Next"}
                </Button>
              </div>
              {outs[i] && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-t p-5">{outs[i]!.node}</motion.div>}
            </Panel>
          </li>
        ))}
      </ol>
    </>
  );
}

function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
      {rows.map(([k, v]) => <div key={k}><dt className="text-xs">{k}</dt><dd className="font-medium text-foreground">{v}</dd></div>)}
    </dl>
  );
}
