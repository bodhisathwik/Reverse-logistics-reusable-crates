/* eslint-disable @typescript-eslint/no-explicit-any */
// API Gateway + simulated microservices. Each service module touches only its own tables.
import {
  applyReturn, findEndpoint, normalizeScan, uniqueCrateIds, isOverdue, validateCrateReturned, validateCustodyIssued,
  TOPIC, SERVICES, type GatewayResponse, type Role,
} from "./domain";

type DB = any;
export interface GwCtx {
  userDb: DB; // RLS-scoped client acting as the caller
  admin: DB; // service-role client, used only by services after the gateway authorised the call
  role: Role | null;
  depotId: string | null;
  email: string;
}

class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}
const PAGE = 25;
const today = () => new Date().toISOString().slice(0, 10);

// ---------------- Service Registry ----------------
async function requireUp(ctx: GwCtx, name: string) {
  const { data } = await ctx.admin.from("service_registry").select("status").eq("name", name).maybeSingle();
  if (!data) throw new HttpError(503, `${name} not registered`);
  if (data.status !== "UP") throw new HttpError(503, `${name} is DOWN in registry`);
}

// ---------------- Event Bus ----------------
async function publish(ctx: GwCtx, key: string, payload: any, producer: string) {
  const errs = payload.eventType === "CrateReturned" ? validateCrateReturned(payload)
    : payload.eventType === "CustodyIssued" ? validateCustodyIssued(payload) : ["unknown eventType"];
  const row = {
    topic: TOPIC, key, event_type: String(payload.eventType ?? "Unknown"), payload, producer,
    status: errs.length ? "FAILED" : "PUBLISHED", error: errs.length ? "Producer rejected: " + errs.join("; ") : null,
  };
  const { data, error } = await ctx.admin.from("event_bus").insert(row).select('"offset", status').single();
  if (error) throw new HttpError(500, error.message);
  return data as { offset: number; status: string };
}

// ---------------- ReturnBalance service (consumer) ----------------
export async function consumePending(ctx: GwCtx) {
  const { data: reg } = await ctx.admin.from("service_registry").select("status").eq("name", "return-balance-service").single();
  if (reg?.status !== "UP") return { consumed: 0, skipped: true };
  const { data: events } = await ctx.admin.from("event_bus").select('"offset", event_type, payload')
    .eq("status", "PUBLISHED").order("offset").limit(100);
  let consumed = 0;
  for (const ev of events ?? []) {
    const p = ev.payload as any;
    try {
      if (ev.event_type === "CustodyIssued") {
        const errs = validateCustodyIssued(p);
        if (errs.length) throw new Error(errs.join("; "));
        const { error } = await ctx.admin.from("balance_custody").upsert({
          custody_id: p.custodyId, depot_id: p.depotId, crate_type: p.crateType, issued: p.issuedQty, returned: 0,
          outstanding: p.issuedQty, due_date: p.dueDate, status: "ISSUED", last_event_offset: ev.offset, updated_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
        await ctx.admin.from("balance_ledger").insert({ event_offset: ev.offset, event_type: ev.event_type, custody_id: p.custodyId, depot_id: p.depotId, delta_issued: p.issuedQty, outstanding_after: p.issuedQty });
      } else if (ev.event_type === "CrateReturned") {
        const errs = validateCrateReturned(p);
        if (errs.length) throw new Error(errs.join("; "));
        const { data: prev } = await ctx.admin.from("balance_custody").select("returned, due_date").eq("custody_id", p.custodyId).maybeSingle();
        const { error } = await ctx.admin.from("balance_custody").upsert({
          custody_id: p.custodyId, depot_id: p.depotId, crate_type: p.crateType, issued: p.issuedQty, returned: p.returnedQty,
          outstanding: p.outstandingQty, due_date: prev?.due_date ?? today(),
          status: p.outstandingQty === 0 ? "CLOSED" : "PARTIALLY_RETURNED", last_event_offset: ev.offset, updated_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
        await ctx.admin.from("balance_ledger").insert({ event_offset: ev.offset, event_type: ev.event_type, custody_id: p.custodyId, depot_id: p.depotId, delta_returned: p.returnedQty - (prev?.returned ?? 0), outstanding_after: p.outstandingQty });
      } else throw new Error("Unknown event type");
      await ctx.admin.from("event_bus").update({ status: "CONSUMED", consumer: "return-balance-service", consumed_at: new Date().toISOString() }).eq("\"offset\"", ev.offset);
      consumed++;
    } catch (e) {
      await ctx.admin.from("event_bus").update({ status: "FAILED", consumer: "return-balance-service", error: "Consumer rejected: " + (e as Error).message, consumed_at: new Date().toISOString() }).eq("\"offset\"", ev.offset);
    }
  }
  if (consumed) await ctx.admin.rpc("balance_recompute_depots");
  return { consumed, skipped: false };
}

// ---------------- Custody service (producer) ----------------
async function issueCustody(ctx: GwCtx, b: any) {
  const qty = Number(b?.qty);
  if (!b?.depot_id || !b?.crate_type || !b?.due_date || !b?.agent_id) throw new HttpError(422, "depot_id, agent_id, crate_type, qty and due_date are required");
  if (!Number.isInteger(qty) || qty <= 0 || qty > 300) throw new HttpError(422, "qty must be a whole number between 1 and 300");
  if (b.due_date < today()) throw new HttpError(422, "due_date cannot be in the past");
  // REST call to CrateAsset service: reserve crates
  await requireUp(ctx, "crate-asset-service");
  const picked = uniqueCrateIds(b.crate_ids);
  let crates: any[] | null;
  if (picked.length) {
    if (picked.length !== qty) throw new HttpError(422, `Verified ${picked.length} crates but quantity is ${qty}`);
    const { data } = await ctx.admin.from("crate_asset_crates").select("id").in("id", picked).eq("crate_type", b.crate_type).eq("status", "AVAILABLE");
    if ((data?.length ?? 0) !== qty) throw new HttpError(409, "Some verified crates are not available or not of this type");
    crates = data;
  } else {
    const { data } = await ctx.admin.from("crate_asset_crates").select("id").eq("crate_type", b.crate_type).eq("status", "AVAILABLE").order("id").limit(qty);
    crates = data;
  }
  if ((crates?.length ?? 0) < qty) throw new HttpError(409, `Only ${crates?.length ?? 0} ${b.crate_type} crates available`);
  const custodyId = "CUS-" + Date.now().toString(36).toUpperCase().slice(-6);
  const { error } = await ctx.admin.from("custody_records").insert({
    custody_id: custodyId, depot_id: b.depot_id, delivery_agent: b.agent_id, crate_type: b.crate_type, issued_qty: qty, due_date: b.due_date,
  });
  if (error) throw new HttpError(422, error.message);
  await ctx.admin.from("crate_asset_crates").update({ status: "ISSUED", holder_ref: custodyId, updated_at: new Date().toISOString() }).in("id", crates!.map((c: any) => c.id));
  const ev = await publish(ctx, custodyId, {
    eventId: crypto.randomUUID(), eventType: "CustodyIssued", occurredAt: new Date().toISOString(), custodyId,
    depotId: b.depot_id, crateType: b.crate_type, issuedQty: qty, dueDate: b.due_date, schemaVersion: 1,
  }, "custody-service");
  await consumePending(ctx);
  return { custodyId, issuedQty: qty, eventOffset: ev.offset };
}

async function collectReturn(ctx: GwCtx, b: any) {
  const scanned = uniqueCrateIds(b?.crate_ids);
  const qty = scanned.length ? scanned.length : Number(b?.qty);
  if (!b?.custody_id) throw new HttpError(422, "custody_id is required");
  const { data: rec } = await ctx.admin.from("custody_records").select("custody_id, depot_id, crate_type, issued_qty, returned_qty, status, delivery_agent").eq("custody_id", b.custody_id).maybeSingle();
  if (!rec) throw new HttpError(404, "Custody not found");
  if (rec.status === "CLOSED") throw new HttpError(409, "Custody already closed");
  const r = applyReturn(rec.issued_qty, rec.returned_qty, qty);
  if (!r.ok) throw new HttpError(422, r.error);
  if (scanned.length) {
    const { data: own } = await ctx.admin.from("crate_asset_crates").select("id").in("id", scanned).eq("holder_ref", rec.custody_id);
    if ((own?.length ?? 0) !== scanned.length) throw new HttpError(422, "One or more scanned crates are not part of this custody");
  }
  const crateIds: string[] = scanned;
  await ctx.admin.from("custody_return_scans").insert({ custody_id: rec.custody_id, qty, crate_ids: crateIds, scanned_by: b.scanned_by || rec.delivery_agent });
  const { error } = await ctx.admin.from("custody_records").update({ returned_qty: r.returned, status: r.status }).eq("custody_id", rec.custody_id);
  if (error) throw new HttpError(422, error.message);
  // REST call to CrateAsset service: release crates
  const { data: held } = scanned.length ? { data: scanned.map((id) => ({ id })) }
    : await ctx.admin.from("crate_asset_crates").select("id").eq("holder_ref", rec.custody_id).order("id").limit(qty);
  if (held?.length) await ctx.admin.from("crate_asset_crates").update({ status: "AVAILABLE", holder_ref: null, updated_at: new Date().toISOString() }).in("id", held.map((c: any) => c.id));
  const event = {
    eventId: crypto.randomUUID(), eventType: "CrateReturned", occurredAt: new Date().toISOString(), custodyId: rec.custody_id,
    depotId: rec.depot_id, crateType: rec.crate_type, issuedQty: rec.issued_qty, returnedQty: r.returned,
    outstandingQty: r.outstanding, scannedBy: b.scanned_by || rec.delivery_agent, schemaVersion: 1,
  };
  const ev = await publish(ctx, rec.custody_id, event, "custody-service");
  const consumer = await consumePending(ctx);
  return { custodyId: rec.custody_id, returnedQty: r.returned, outstandingQty: r.outstanding, status: r.status, eventOffset: ev.offset, event, consumerSkipped: consumer.skipped };
}

// ---------------- Router ----------------
function pageRange(b: any) {
  const p = Math.max(0, Number(b?.page ?? 0) | 0);
  return [p * PAGE, p * PAGE + PAGE - 1] as const;
}

async function route(ctx: GwCtx, method: string, path: string, b: any): Promise<any> {
  const key = `${method} ${path}`;
  const db = ctx.userDb;
  switch (key) {
    case "GET /stats": {
      const [bal, cus, crates, events] = await Promise.all([
        db.from("balance_depot").select("issued, returned, outstanding"),
        db.from("balance_custody").select("due_date, outstanding"),
        ctx.admin.from("crate_asset_crates").select("id", { count: "exact", head: true }).eq("status", "ISSUED"),
        ctx.admin.from("event_bus").select('"offset"', { count: "exact", head: true }).eq("status", "CONSUMED"),
      ]);
      const outstanding = (bal.data ?? []).reduce((s: number, r: any) => s + r.outstanding, 0);
      const overdue = (cus.data ?? []).filter((r: any) => isOverdue(r.due_date, r.outstanding)).length;
      return { cratesOut: ctx.role === "deliveryAgent" ? crates.count ?? 0 : outstanding, outstanding, overdue, eventsProcessed: events.count ?? 0,
        returned: (bal.data ?? []).reduce((s: number, r: any) => s + r.returned, 0) };
    }
    case "GET /meta": {
      const [d, a, t] = await Promise.all([
        db.from("custody_depots").select("id, name, city").order("id"),
        db.from("custody_agents").select("id, name").order("id"),
        db.from("crate_asset_types").select("code, label, capacity_l").order("code"),
      ]);
      return { depots: d.data ?? [], agents: a.data ?? [], types: t.data ?? [] };
    }
    case "GET /custody": {
      await requireUp(ctx, "custody-service");
      const [from, to] = pageRange(b);
      let q = db.from("custody_records").select("custody_id, depot_id, delivery_agent, crate_type, issued_qty, returned_qty, status, issue_date, due_date, created_at", { count: "exact" }).order("created_at", { ascending: false });
      if (b?.open) q = q.neq("status", "CLOSED");
      const { data, count, error } = await q.range(from, to);
      if (error) throw new HttpError(500, error.message);
      return { rows: (data ?? []).map((r: any) => ({ ...r, overdue: isOverdue(r.due_date, r.issued_qty - r.returned_qty) })), total: count ?? 0 };
    }
    case "GET /custody/crates": {
      await requireUp(ctx, "custody-service");
      if (!b?.custody_id) throw new HttpError(422, "custody_id is required");
      const { data: rec } = await db.from("custody_records").select("custody_id, depot_id, crate_type, issued_qty, returned_qty, status").eq("custody_id", b.custody_id).maybeSingle();
      if (!rec) throw new HttpError(404, "Custody not found");
      const { data: held } = await ctx.admin.from("crate_asset_crates").select("id").eq("holder_ref", rec.custody_id).order("id");
      return { custody: rec, crates: (held ?? []).map((c: any) => c.id) };
    }
    case "POST /custody/verify": {
      await requireUp(ctx, "custody-service");
      const id = normalizeScan(String(b?.code ?? ""));
      if (id.kind !== "crate") return { valid: false, reason: "UNKNOWN", message: "Not a crate code" };
      const { data: c } = await ctx.admin.from("crate_asset_crates").select("id, holder_ref").eq("id", id.id).maybeSingle();
      if (!c) return { valid: false, reason: "UNKNOWN", crateId: id.id, message: "Unknown crate ID" };
      if (c.holder_ref !== b?.custody_id) return { valid: false, reason: "NOT_IN_CUSTODY", crateId: id.id, message: "Crate not part of this custody" };
      return { valid: true, crateId: id.id };
    }
    case "POST /assets/verify": {
      await requireUp(ctx, "crate-asset-service");
      const id = normalizeScan(String(b?.code ?? ""));
      if (id.kind !== "crate") return { valid: false, message: "Not a crate code" };
      const { data: c } = await ctx.admin.from("crate_asset_crates").select("id, crate_type, status").eq("id", id.id).maybeSingle();
      if (!c) return { valid: false, crateId: id.id, message: "Unknown crate ID" };
      if (c.status !== "AVAILABLE") return { valid: false, crateId: id.id, message: `Crate is ${c.status}` };
      if (b?.crate_type && c.crate_type !== b.crate_type) return { valid: false, crateId: id.id, message: `Crate is ${c.crate_type}, not ${b.crate_type}` };
      return { valid: true, crateId: id.id };
    }
    case "GET /labels": {
      const [from, to] = [Math.max(0, Number(b?.page ?? 0) | 0) * 48, Math.max(0, Number(b?.page ?? 0) | 0) * 48 + 47];
      let q = db.from("crate_asset_crates").select("id, crate_type, status, holder_ref", { count: "exact" }).order("id");
      if (b?.custody_id) q = q.eq("holder_ref", b.custody_id);
      else if (b?.status) q = q.eq("status", b.status);
      const [{ data, count }, cus] = await Promise.all([q.range(from, to), db.from("custody_records").select("custody_id, depot_id").neq("status", "CLOSED")]);
      const depotOf = Object.fromEntries((cus.data ?? []).map((c: any) => [c.custody_id, c.depot_id]));
      return { rows: (data ?? []).map((r: any) => ({ ...r, depot_id: r.holder_ref ? depotOf[r.holder_ref] ?? null : null })), total: count ?? 0, custodies: cus.data ?? [] };
    }
    case "POST /custody/issue": await requireUp(ctx, "custody-service"); return issueCustody(ctx, b);
    case "POST /custody/return": await requireUp(ctx, "custody-service"); return collectReturn(ctx, b);
    case "GET /balances": {
      await requireUp(ctx, "return-balance-service");
      const [dep, cus] = await Promise.all([
        db.from("balance_depot").select("depot_id, depot_name, issued, returned, outstanding, updated_at").order("depot_id"),
        db.from("balance_custody").select("depot_id, due_date, outstanding"),
      ]);
      const od: Record<string, number> = {};
      for (const c of cus.data ?? []) if (isOverdue(c.due_date, c.outstanding)) od[c.depot_id] = (od[c.depot_id] ?? 0) + 1;
      return { rows: (dep.data ?? []).map((r: any) => ({ ...r, overdue_count: od[r.depot_id] ?? 0 })) };
    }
    case "GET /balances/custody": {
      await requireUp(ctx, "return-balance-service");
      const [from, to] = pageRange(b);
      const q = db.from("balance_custody").select("custody_id, depot_id, crate_type, issued, returned, outstanding, due_date, status, last_event_offset, updated_at", { count: "exact" });
      const { data, count } = b?.overdue
        ? await q.gt("outstanding", 0).lt("due_date", today()).order("due_date").range(from, to)
        : await q.order("updated_at", { ascending: false }).range(from, to);
      return { rows: (data ?? []).map((r: any) => ({ ...r, overdue: isOverdue(r.due_date, r.outstanding) })), total: count ?? 0 };
    }
    case "GET /assets/crates": {
      await requireUp(ctx, "crate-asset-service");
      const [from, to] = pageRange(b);
      let q = db.from("crate_asset_crates").select("id, crate_type, condition, status, holder_ref, updated_at", { count: "exact" }).order("id");
      if (b?.status) q = q.eq("status", b.status);
      const { data, count } = await q.range(from, to);
      return { rows: data ?? [], total: count ?? 0 };
    }
    case "GET /events": {
      const [from, to] = pageRange(b);
      const { data, count } = await db.from("event_bus").select('"offset", topic, key, event_type, payload, producer, consumer, status, error, created_at, consumed_at', { count: "exact" }).order("offset", { ascending: false }).range(from, to);
      return { rows: data ?? [], total: count ?? 0 };
    }
    case "POST /events/malformed": {
      const ev = await publish(ctx, "CUS-BROKEN", { eventId: crypto.randomUUID(), eventType: "CrateReturned", custodyId: "CUS-BROKEN", issuedQty: 10, returnedQty: 14, schemaVersion: 1 }, "custody-service");
      return ev;
    }
    case "GET /gateway/log": {
      const [from, to] = pageRange(b);
      const { data, count } = await db.from("gateway_log").select("id, created_at, method, path, role, user_email, target_service, decision, status_code, reason, latency_ms", { count: "exact" }).order("id", { ascending: false }).range(from, to);
      return { rows: data ?? [], total: count ?? 0 };
    }
    case "GET /registry": {
      const { data } = await db.from("service_registry").select("name, instance_id, url, status, last_heartbeat").order("name");
      return { rows: data ?? [] };
    }
    case "POST /registry/toggle": {
      if (!SERVICES.includes(b?.name)) throw new HttpError(422, "Unknown service");
      const status = b.status === "DOWN" ? "DOWN" : "UP";
      await ctx.admin.from("service_registry").update({ status, last_heartbeat: new Date().toISOString() }).eq("name", b.name);
      const drained = status === "UP" && b.name === "return-balance-service" ? await consumePending(ctx) : null;
      return { name: b.name, status, drained: drained?.consumed ?? 0 };
    }
    case "GET /stores": {
      const [crates, types, cus, scans, bc, bd, led] = await Promise.all([
        db.from("crate_asset_crates").select("id, crate_type, status, holder_ref").order("updated_at", { ascending: false }).limit(8),
        db.from("crate_asset_types").select("code, label, capacity_l"),
        db.from("custody_records").select("custody_id, depot_id, issued_qty, returned_qty, status").order("created_at", { ascending: false }).limit(8),
        db.from("custody_return_scans").select("id, custody_id, qty, scanned_by").order("id", { ascending: false }).limit(8),
        db.from("balance_custody").select("custody_id, issued, returned, outstanding, status").order("updated_at", { ascending: false }).limit(8),
        db.from("balance_depot").select("depot_id, issued, returned, outstanding").order("depot_id"),
        db.from("balance_ledger").select("id, event_offset, event_type, custody_id, outstanding_after").order("id", { ascending: false }).limit(8),
      ]);
      return {
        "crate-asset-service": { crate_asset_types: types.data, crate_asset_crates: crates.data },
        "custody-service": { custody_records: cus.data, custody_return_scans: scans.data },
        "return-balance-service": { balance_depot: bd.data, balance_custody: bc.data, balance_ledger: led.data },
      };
    }
    case "POST /admin/seed": {
      const { error } = await ctx.admin.rpc("seed_demo");
      if (error) throw new HttpError(500, error.message);
      await ctx.admin.from("service_registry").update({ status: "UP", last_heartbeat: new Date().toISOString() }).neq("name", "");
      return { seeded: true };
    }
  }
  throw new HttpError(404, "No route");
}

/** Gateway entry: authorise by role, route, log every call. */
export async function dispatch(ctx: GwCtx, method: string, path: string, body: any): Promise<GatewayResponse> {
  const t0 = Date.now();
  const ep = findEndpoint(method, path);
  let res: GatewayResponse;
  let reason = "ok";
  if (!ep) { res = { ok: false, status: 404, error: "Unknown endpoint" }; reason = "unknown endpoint"; }
  else if (!ctx.role || !ep.roles.includes(ctx.role)) {
    reason = `role ${ctx.role ?? "none"} not permitted (requires ${ep.roles.join(" | ")})`;
    res = { ok: false, status: 403, error: "Forbidden: " + reason, service: ep.service };
  } else {
    try {
      const data = await route(ctx, method, path, body);
      res = { ok: true, status: 200, data, service: ep.service };
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      reason = (e as Error).message;
      res = { ok: false, status, error: reason, service: ep.service };
    }
  }
  res.latencyMs = Date.now() - t0;
  await ctx.admin.from("gateway_log").insert({
    method, path, role: ctx.role, user_email: ctx.email, target_service: ep?.service ?? null,
    decision: res.status === 403 || res.status === 404 ? "DENY" : "ALLOW", status_code: res.status, reason, latency_ms: res.latencyMs,
  });
  return res;
}
