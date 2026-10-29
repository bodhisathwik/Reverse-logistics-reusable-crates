import { describe, expect, it } from "vitest";
import { applyReturn, isOverdue, validateCrateReturned, findEndpoint } from "@/lib/domain";

describe("core domain rule", () => {
  it("issue 50, return 42 keeps 8 outstanding and does not close", () => {
    const r = applyReturn(50, 0, 42);
    expect(r).toEqual({ ok: true, returned: 42, outstanding: 8, status: "PARTIALLY_RETURNED" });
  });
  it("is cumulative across scans", () => {
    const r = applyReturn(50, 20, 22);
    expect(r.ok && r.outstanding).toBe(8);
  });
  it("rejects over-returns", () => {
    expect(applyReturn(50, 42, 9).ok).toBe(false);
  });
  it("closes only when fully returned", () => {
    const r = applyReturn(50, 42, 8);
    expect(r.ok && r.status).toBe("CLOSED");
  });
  it("flags overdue only with outstanding > 0 past due date", () => {
    const today = new Date("2026-10-29");
    expect(isOverdue("2026-10-20", 8, today)).toBe(true);
    expect(isOverdue("2026-10-20", 0, today)).toBe(false);
    expect(isOverdue("2026-11-05", 8, today)).toBe(false);
  });
});

describe("contract & security", () => {
  it("rejects malformed CrateReturned events", () => {
    expect(validateCrateReturned({ eventType: "CrateReturned", issuedQty: 10, returnedQty: 14 }).length).toBeGreaterThan(0);
  });
  it("customerDepot cannot issue or scan", () => {
    expect(findEndpoint("POST", "/custody/issue")!.roles).not.toContain("customerDepot");
    expect(findEndpoint("POST", "/custody/return")!.roles).not.toContain("customerDepot");
  });
});

import { normalizeScan, uniqueCrateIds } from "@/lib/domain";
describe("scanning", () => {
  it("parses label codes and bare IDs", () => {
    expect(normalizeScan("CRATE-B40-0007")).toEqual({ kind: "crate", id: "B40-0007" });
    expect(normalizeScan("custody-CUS-1003")).toEqual({ kind: "custody", id: "CUS-1003" });
    expect(normalizeScan("g25-0012")).toEqual({ kind: "crate", id: "G25-0012" });
    expect(normalizeScan("hello").kind).toBe("unknown");
  });
  it("counts each crate once so returnedQty = unique scans", () => {
    expect(uniqueCrateIds(["CRATE-B40-0001", "B40-0001", "B40-0002", "junk", ""])).toEqual(["B40-0001", "B40-0002"]);
  });
});

import { passwordStrength, safeRedirect } from "@/lib/domain";
describe("auth rules", () => {
  it("rejects passwords under 8 chars", () => { expect(passwordStrength("Ab1!xyz")).toBe(0); });
  it("scores a strong password 4", () => { expect(passwordStrength("Abcdef1!gh")).toBe(4); });
  it("blocks external redirects", () => { expect(safeRedirect("//evil.com")).toBe("/tower"); expect(safeRedirect("/balances")).toBe("/balances"); });
});
