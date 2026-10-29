import { memo, useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { onFlow, type FlowPulse } from "@/lib/flow";

type Pt = [number, number];
const N = {
  client: [70, 180] as Pt, gateway: [230, 180] as Pt, registry: [400, 50] as Pt,
  asset: [580, 80] as Pt, custody: [580, 180] as Pt, balance: [580, 280] as Pt, bus: [790, 230] as Pt,
};
const EDGES: [Pt, Pt][] = [
  [N.client, N.gateway], [N.gateway, N.registry], [N.gateway, N.asset], [N.gateway, N.custody], [N.gateway, N.balance],
  [N.custody, N.bus], [N.bus, N.balance], [N.custody, N.asset],
];
const svc: Record<string, keyof typeof N> = {
  "crate-asset-service": "asset", "custody-service": "custody", "return-balance-service": "balance",
};

function pathFor(p: FlowPulse): Pt[] {
  if (p.kind === "deny") return [N.client, N.gateway];
  if (p.kind === "event") return [N.custody, N.bus, N.balance];
  const target = N[svc[p.service ?? "custody-service"] ?? "custody"];
  return [N.client, N.gateway, target];
}

export const Diagram = memo(function Diagram({ status }: { status: Record<string, string> }) {
  const [pulses, setPulses] = useState<FlowPulse[]>([]);
  const [drops, setDrops] = useState<number[]>([]);
  const reduce = useReducedMotion();
  useEffect(() => onFlow((p) => {
    setPulses((s) => [...s.slice(-6), p]);
    if (p.kind === "event") setDrops((d) => [...d.slice(-3), p.id]);
    setTimeout(() => setPulses((s) => s.filter((x) => x.id !== p.id)), 1600);
  }), []);

  const node = (key: keyof typeof N, label: string, sub: string, service?: string) => {
    const [x, y] = N[key];
    const st = service ? status[service] : undefined;
    const color = st === "DOWN" ? "var(--danger)" : st === "UP" ? "var(--success)" : "var(--info)";
    return (
      <g key={key} transform={`translate(${x - 70} ${y - 26})`}>
        <rect width="140" height="52" rx="12" fill="var(--surface-2)" stroke="var(--border)" />
        <text x="16" y="23" fill="var(--foreground)" fontSize="12" fontWeight="600">{label}</text>
        <text x="16" y="39" fill="var(--muted-foreground)" fontSize="10">{sub}</text>
        <circle cx="124" cy="16" r="4" fill={color} className={st !== "DOWN" ? "animate-soft-pulse" : undefined} style={{ transformOrigin: "124px 16px" }} />
      </g>
    );
  };

  return (
    <svg viewBox="0 0 880 330" className="h-auto w-full" role="img" aria-label="Architecture diagram">
      {EDGES.map(([a, b], i) => (
        <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--border)" strokeWidth="1.5" strokeDasharray="4 4" />
      ))}
      {node("client", "Client", "React · JWT")}
      {node("gateway", "API Gateway", "auth · route · log")}
      {node("registry", "Service Registry", "eureka (sim)")}
      {node("asset", "CrateAsset", "crate_asset_*", "crate-asset-service")}
      {node("custody", "Custody", "producer", "custody-service")}
      {node("balance", "ReturnBalance", "consumer", "return-balance-service")}
      <g transform={`translate(${N.bus[0] - 70} ${N.bus[1] - 40})`}>
        <rect width="140" height="80" rx="12" fill="var(--surface-2)" stroke="var(--warning)" strokeOpacity="0.4" />
        <text x="16" y="22" fill="var(--foreground)" fontSize="12" fontWeight="600">Event Bus</text>
        <text x="16" y="37" fill="var(--warning)" fontSize="9" fontFamily="var(--font-mono)">soa.s06.t06.events</text>
        <AnimatePresence>
          {drops.map((d, i) => (
            <motion.rect key={d} x={16 + i * 28} y={50} width="22" height="14" rx="3" fill="var(--warning)"
              initial={{ opacity: 0, y: -18 }} animate={{ opacity: 0.85, y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 18 }} />
          ))}
        </AnimatePresence>
      </g>
      {!reduce && pulses.map((p) => {
        const pts = pathFor(p);
        const color = p.kind === "deny" ? "var(--danger)" : p.kind === "event" ? "var(--warning)" : "var(--info)";
        return (
          <motion.g key={p.id} initial={{ x: pts[0][0], y: pts[0][1], opacity: 0 }}
            animate={{ x: pts.map((q) => q[0]), y: pts.map((q) => q[1]), opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, ease: "easeInOut" }}>
            <circle r="9" fill={color} opacity="0.25" />
            <circle r="4" fill={color} />
          </motion.g>
        );
      })}
    </svg>
  );
});
