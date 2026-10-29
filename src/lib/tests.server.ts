/* eslint-disable @typescript-eslint/no-explicit-any */
import { applyReturn, validateCrateReturned } from "./domain";
import { dispatch, type GwCtx } from "./gateway.server";
import type { TestResult } from "./tests.types";

export async function runAllTests(admin: any): Promise<TestResult[]> {
  const out: TestResult[] = [];
  const agent: GwCtx = { userDb: admin, admin, role: "deliveryAgent", depotId: null, email: "test-runner@agent" };
  const depot: GwCtx = { userDb: admin, admin, role: "customerDepot", depotId: "DEP-001", email: "test-runner@depot" };

  async function t(group: string, name: string, assertion: string, fn: () => Promise<boolean | string> | boolean | string) {
    const t0 = performance.now();
    try {
      const r = await fn();
      out.push({ group, name, assertion, passed: r === true, ms: Math.round(performance.now() - t0), detail: typeof r === "string" ? r : undefined });
    } catch (e) {
      out.push({ group, name, assertion, passed: false, ms: Math.round(performance.now() - t0), detail: (e as Error).message });
    }
  }

  // (a) domain rule
  await t("Domain", "Short return keeps outstanding", "issue 50, return 42 → outstanding 8, PARTIALLY_RETURNED", () => {
    const r = applyReturn(50, 0, 42);
    return r.ok && r.outstanding === 8 && r.status === "PARTIALLY_RETURNED";
  });
  await t("Domain", "Cumulative scans", "50 issued, scans 20 + 22 → outstanding 8", () => {
    const a = applyReturn(50, 0, 20);
    if (!a.ok) return false;
    const b = applyReturn(50, a.returned, 22);
    return b.ok && b.outstanding === 8;
  });
  await t("Domain", "Over-return rejected", "50 issued, return 51 → rejected", () => !applyReturn(50, 0, 51).ok);
  await t("Domain", "Full return closes", "50 issued, return 50 → CLOSED", () => { const r = applyReturn(50, 0, 50); return r.ok && r.status === "CLOSED"; });

  // (b) integration
  let cid = "";
  await t("Integration", "Gateway issue → return → consumed", "POST /custody/issue + /custody/return yields CONSUMED event and balance outstanding 8", async () => {
    const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const iss = await dispatch(agent, "POST", "/custody/issue", { depot_id: "DEP-003", agent_id: "AGT-02", crate_type: "GREEN25", qty: 50, due_date: due });
    if (!iss.ok) return "issue failed: " + iss.error;
    cid = (iss.data as any).custodyId;
    const ret = await dispatch(agent, "POST", "/custody/return", { custody_id: cid, qty: 42 });
    if (!ret.ok) return "return failed: " + ret.error;
    const off = (ret.data as any).eventOffset;
    const { data: ev } = await admin.from("event_bus").select("status").eq("\"offset\"", off).single();
    const { data: bal } = await admin.from("balance_custody").select("outstanding, status").eq("custody_id", cid).single();
    if (ev?.status !== "CONSUMED") return "event status " + ev?.status;
    return bal?.outstanding === 8 && bal?.status === "PARTIALLY_RETURNED" ? true : `balance ${JSON.stringify(bal)}`;
  });
  await t("Integration", "Over-return via gateway", "returning 9 more on outstanding 8 → 422", async () => {
    if (!cid) return "no custody";
    const r = await dispatch(agent, "POST", "/custody/return", { custody_id: cid, qty: 9 });
    return r.status === 422;
  });

  // (c) persistence constraints
  await t("Persistence", "No negative quantities", "custody issued_qty = -5 rejected by DB", async () => {
    const { error } = await admin.from("custody_records").insert({ custody_id: "T-NEG", depot_id: "DEP-001", delivery_agent: "AGT-01", crate_type: "BLUE40", issued_qty: -5, due_date: "2030-01-01" });
    if (!error) await admin.from("custody_records").delete().eq("custody_id", "T-NEG");
    return !!error;
  });
  await t("Persistence", "returned ≤ issued", "returned_qty 11 on issued 10 rejected", async () => {
    const { error } = await admin.from("custody_records").insert({ custody_id: "T-OVR", depot_id: "DEP-001", delivery_agent: "AGT-01", crate_type: "BLUE40", issued_qty: 10, returned_qty: 11, due_date: "2030-01-01" });
    if (!error) await admin.from("custody_records").delete().eq("custody_id", "T-OVR");
    return !!error;
  });
  await t("Persistence", "Required fields", "custody without depot_id rejected", async () => {
    const { error } = await admin.from("custody_records").insert({ custody_id: "T-REQ", delivery_agent: "AGT-01", crate_type: "BLUE40", issued_qty: 10, due_date: "2030-01-01" });
    if (!error) await admin.from("custody_records").delete().eq("custody_id", "T-REQ");
    return !!error;
  });
  await t("Persistence", "Balance never negative", "balance_custody outstanding = -1 rejected", async () => {
    const { error } = await admin.from("balance_custody").insert({ custody_id: "T-BAL", depot_id: "DEP-001", crate_type: "BLUE40", issued: 1, returned: 0, outstanding: -1, due_date: "2030-01-01", status: "X" });
    if (!error) await admin.from("balance_custody").delete().eq("custody_id", "T-BAL");
    return !!error;
  });

  // (d) contract
  await t("Contract", "CrateReturned valid", "all 11 contract fields present and consistent", () => validateCrateReturned({
    eventId: "e", eventType: "CrateReturned", occurredAt: new Date().toISOString(), custodyId: "C", depotId: "D", crateType: "BLUE40",
    issuedQty: 50, returnedQty: 42, outstandingQty: 8, scannedBy: "AGT-01", schemaVersion: 1,
  }).length === 0);
  await t("Contract", "Malformed event rejected", "missing fields / returned > issued → violations", () => validateCrateReturned({ eventType: "CrateReturned", issuedQty: 10, returnedQty: 14 }).length > 0);
  await t("Contract", "REST /balances shape", "rows expose depot_id, issued, returned, outstanding, overdue_count", async () => {
    const r = await dispatch(agent, "GET", "/balances", {});
    const row = (r.data as any)?.rows?.[0];
    return !!row && ["depot_id", "issued", "returned", "outstanding", "overdue_count"].every((k) => k in row);
  });

  // (e) security
  await t("Security", "Depot cannot issue", "customerDepot POST /custody/issue → 403", async () => (await dispatch(depot, "POST", "/custody/issue", {})).status === 403);
  await t("Security", "Depot cannot scan returns", "customerDepot POST /custody/return → 403", async () => (await dispatch(depot, "POST", "/custody/return", {})).status === 403);
  await t("Security", "Depot cannot read event bus", "customerDepot GET /events → 403", async () => (await dispatch(depot, "GET", "/events", {})).status === 403);

  // cleanup integration data so the demo stays tidy
  if (cid) {
    await admin.from("crate_asset_crates").update({ status: "AVAILABLE", holder_ref: null }).eq("holder_ref", cid);
    await admin.from("balance_ledger").delete().eq("custody_id", cid);
    await admin.from("balance_custody").delete().eq("custody_id", cid);
    await admin.from("custody_records").delete().eq("custody_id", cid);
    await admin.from("event_bus").delete().eq("key", cid);
    await admin.rpc("balance_recompute_depots");
  }
  return out;
}
