// Pure domain logic shared by services, tests and UI. No I/O here.

export type Role = "deliveryAgent" | "customerDepot";
export type CustodyStatus = "ISSUED" | "PARTIALLY_RETURNED" | "CLOSED";

export const TOPIC = "soa.s06.t06.events";
export const SERVICES = ["crate-asset-service", "custody-service", "return-balance-service"] as const;
export type ServiceName = (typeof SERVICES)[number];

export type ReturnResult =
  | { ok: true; returned: number; outstanding: number; status: CustodyStatus }
  | { ok: false; error: string };

/** Core rule: never close a custody while crates are outstanding; reject over-returns. */
export function applyReturn(issued: number, returnedSoFar: number, qty: number): ReturnResult {
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, error: "Return quantity must be a positive whole number" };
  if (!Number.isInteger(issued) || issued <= 0) return { ok: false, error: "Invalid issued quantity" };
  const returned = returnedSoFar + qty;
  if (returned > issued)
    return { ok: false, error: `Over-return rejected: ${returned} returned exceeds ${issued} issued` };
  const outstanding = issued - returned;
  return { ok: true, returned, outstanding, status: outstanding === 0 ? "CLOSED" : "PARTIALLY_RETURNED" };
}

export function isOverdue(dueDate: string, outstanding: number, today: Date = new Date()): boolean {
  const t = today.toISOString().slice(0, 10);
  return outstanding > 0 && dueDate < t;
}

export interface CrateReturnedEvent {
  eventId: string;
  eventType: "CrateReturned";
  occurredAt: string;
  custodyId: string;
  depotId: string;
  crateType: string;
  issuedQty: number;
  returnedQty: number;
  outstandingQty: number;
  scannedBy: string;
  schemaVersion: number;
}

export const CRATE_RETURNED_FIELDS = [
  "eventId", "eventType", "occurredAt", "custodyId", "depotId", "crateType",
  "issuedQty", "returnedQty", "outstandingQty", "scannedBy", "schemaVersion",
] as const;

/** Validates the CrateReturned contract. Returns a list of violations (empty = valid). */
export function validateCrateReturned(e: unknown): string[] {
  const errs: string[] = [];
  if (!e || typeof e !== "object") return ["payload is not an object"];
  const o = e as Record<string, unknown>;
  for (const f of CRATE_RETURNED_FIELDS) if (o[f] === undefined || o[f] === null || o[f] === "") errs.push(`missing ${f}`);
  if (o.eventType !== undefined && o.eventType !== "CrateReturned") errs.push("eventType must be CrateReturned");
  for (const f of ["issuedQty", "returnedQty", "outstandingQty", "schemaVersion"]) {
    if (o[f] !== undefined && (typeof o[f] !== "number" || !Number.isInteger(o[f]) || (o[f] as number) < 0))
      errs.push(`${f} must be a non-negative integer`);
  }
  if (errs.length === 0) {
    const i = o.issuedQty as number, r = o.returnedQty as number, out = o.outstandingQty as number;
    if (r > i) errs.push("returnedQty exceeds issuedQty");
    if (i - r !== out) errs.push("outstandingQty must equal issuedQty - returnedQty");
  }
  return errs;
}

export function validateCustodyIssued(e: unknown): string[] {
  if (!e || typeof e !== "object") return ["payload is not an object"];
  const o = e as Record<string, unknown>;
  const errs: string[] = [];
  for (const f of ["eventId", "custodyId", "depotId", "crateType", "issuedQty", "dueDate"]) if (o[f] == null) errs.push(`missing ${f}`);
  if (typeof o.issuedQty === "number" && o.issuedQty <= 0) errs.push("issuedQty must be positive");
  return errs;
}

export interface Endpoint {
  method: "GET" | "POST";
  path: string;
  service: string;
  roles: Role[];
  description: string;
}

const BOTH: Role[] = ["deliveryAgent", "customerDepot"];
const AGENT: Role[] = ["deliveryAgent"];

export const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/stats", service: "api-gateway", roles: BOTH, description: "Dashboard aggregates" },
  { method: "GET", path: "/meta", service: "custody-service", roles: BOTH, description: "Depots, agents, crate types" },
  { method: "GET", path: "/custody", service: "custody-service", roles: BOTH, description: "List custody records (own depot for customers)" },
  { method: "GET", path: "/custody/crates", service: "custody-service", roles: AGENT, description: "Crates held under a custody (for scanning)" },
  { method: "POST", path: "/custody/verify", service: "custody-service", roles: AGENT, description: "Validate a scanned crate against a custody" },
  { method: "POST", path: "/assets/verify", service: "crate-asset-service", roles: AGENT, description: "Verify a crate is available before issuing" },
  { method: "GET", path: "/labels", service: "crate-asset-service", roles: AGENT, description: "Crate QR label data" },
  { method: "POST", path: "/custody/issue", service: "custody-service", roles: AGENT, description: "Issue crate custody" },
  { method: "POST", path: "/custody/return", service: "custody-service", roles: AGENT, description: "Collect a return scan" },
  { method: "GET", path: "/balances", service: "return-balance-service", roles: BOTH, description: "Depot balances" },
  { method: "GET", path: "/balances/custody", service: "return-balance-service", roles: BOTH, description: "Per-custody balances & overdue flags" },
  { method: "GET", path: "/assets/crates", service: "crate-asset-service", roles: AGENT, description: "Crate registry" },
  { method: "GET", path: "/events", service: "event-bus", roles: AGENT, description: "Read topic " + TOPIC },
  { method: "POST", path: "/events/malformed", service: "custody-service", roles: AGENT, description: "Publish a malformed event (demo)" },
  { method: "GET", path: "/gateway/log", service: "api-gateway", roles: AGENT, description: "Gateway request log" },
  { method: "GET", path: "/registry", service: "service-registry", roles: BOTH, description: "Service registry" },
  { method: "POST", path: "/registry/toggle", service: "service-registry", roles: AGENT, description: "Kill / revive a service" },
  { method: "GET", path: "/stores", service: "api-gateway", roles: AGENT, description: "Per-service data store snapshot" },
  { method: "POST", path: "/admin/seed", service: "api-gateway", roles: AGENT, description: "Reset & seed synthetic data" },
];

export function findEndpoint(method: string, path: string) {
  return ENDPOINTS.find((e) => e.method === method && e.path === path);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface GatewayResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  service?: string;
  latencyMs?: number;
}

export type ScanCode = { kind: "crate" | "custody"; id: string } | { kind: "unknown"; id: string };

/** Parses a scanned QR/barcode. Labels encode CRATE-<crateId> or CUSTODY-<custodyId>; bare IDs are accepted too. */
export function normalizeScan(raw: string): ScanCode {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("CRATE-")) return { kind: "crate", id: v.slice(6) };
  if (v.startsWith("CUSTODY-")) return { kind: "custody", id: v.slice(8) };
  if (/^(B40|G25)-\d{4}$/.test(v)) return { kind: "crate", id: v };
  if (/^CUS-[A-Z0-9]+$/.test(v)) return { kind: "custody", id: v };
  return { kind: "unknown", id: v };
}

export const crateQr = (id: string) => `CRATE-${id}`;
export const custodyQr = (id: string) => `CUSTODY-${id}`;

/** Normalises a list of scanned crate codes, dropping blanks, non-crate codes and duplicates. */
export function uniqueCrateIds(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out = new Set<string>();
  for (const x of list) {
    const s = normalizeScan(String(x ?? ""));
    if (s.kind === "crate" && s.id) out.add(s.id);
  }
  return [...out];
}

/** Password strength 0-4 (length >= 8 required for any score). */
export function passwordStrength(pw: string): number {
  if (!pw || pw.length < 8) return 0;
  let s = 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) s++;
  return Math.min(s, 4);
}

/** Only same-origin app paths are allowed as post-login redirects. */
export function safeRedirect(p: unknown): string {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/auth") ? p : "/tower";
}
