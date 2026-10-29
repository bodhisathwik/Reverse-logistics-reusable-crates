// Tiny pub/sub used to animate request/event flow on the Control Tower diagram.
export type FlowKind = "request" | "event" | "deny";
export interface FlowPulse { id: number; kind: FlowKind; service?: string }
type L = (p: FlowPulse) => void;
const listeners = new Set<L>();
let n = 0;
export function emitFlow(kind: FlowKind, service?: string) {
  const p = { id: ++n, kind, service };
  listeners.forEach((l) => l(p));
}
export function onFlow(l: L) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
