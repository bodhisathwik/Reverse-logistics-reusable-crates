import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CODE_RE = /^[A-Z0-9-]{4,32}$/;
const DEPOT_RE = /^[A-Z0-9-]{2,20}$/;

/** Verifies an agent access code server-side and promotes the caller to deliveryAgent. */
export const redeemAgentCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => {
    const code = String(d?.code ?? "").trim().toUpperCase();
    if (!CODE_RE.test(code)) throw new Error("Invalid access code format");
    return { code };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("agent_access_codes").select("code").eq("code", data.code).eq("active", true).maybeSingle();
    const email = String((context.claims as Record<string, unknown>)?.email ?? "unknown");
    if (!row) {
      await supabaseAdmin.from("gateway_log").insert({ method: "POST", path: "/auth/agent-code", role: "customerDepot", user_email: email, target_service: "auth", decision: "DENY", status_code: 403, reason: "Invalid agent access code", latency_ms: 0 });
      throw new Error("That agent access code is not valid");
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", context.userId).eq("role", "customerDepot");
    await supabaseAdmin.from("user_roles").upsert({ user_id: context.userId, role: "deliveryAgent", depot_id: null }, { onConflict: "user_id,role" });
    await supabaseAdmin.auth.admin.updateUserById(context.userId, { app_metadata: { role: "deliveryAgent", depot_id: null }, user_metadata: { agent_code: null } });
    await supabaseAdmin.from("gateway_log").insert({ method: "POST", path: "/auth/agent-code", role: "deliveryAgent", user_email: email, target_service: "auth", decision: "ALLOW", status_code: 200, reason: "Promoted to deliveryAgent", latency_ms: 0 });
    return { role: "deliveryAgent" as const };
  });

/** Lets a customerDepot user with no depot yet (e.g. first Google sign-in) pick one, once. */
export const chooseMyDepot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { depotId: string }) => {
    const depotId = String(d?.depotId ?? "").trim();
    if (!DEPOT_RE.test(depotId)) throw new Error("Invalid depot");
    return { depotId };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: dep } = await supabaseAdmin.from("custody_depots").select("id").eq("id", data.depotId).maybeSingle();
    if (!dep) throw new Error("Unknown depot");
    const { data: r } = await supabaseAdmin.from("user_roles").select("depot_id").eq("user_id", context.userId).eq("role", "customerDepot").maybeSingle();
    if (!r) throw new Error("No depot role");
    if (r.depot_id) throw new Error("Depot already assigned");
    await supabaseAdmin.from("user_roles").update({ depot_id: data.depotId }).eq("user_id", context.userId).eq("role", "customerDepot");
    await supabaseAdmin.auth.admin.updateUserById(context.userId, { app_metadata: { role: "customerDepot", depot_id: data.depotId } });
    return { depotId: data.depotId };
  });

/** Audit successful sign-in / sign-out to gateway_log with the caller's real role. */
export const logAuthEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { event: "sign-in" | "sign-out" }) => {
    if (d?.event !== "sign-in" && d?.event !== "sign-out") throw new Error("Bad event");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    const role = roles?.find((r) => r.role === "deliveryAgent")?.role ?? roles?.[0]?.role ?? null;
    await supabaseAdmin.from("gateway_log").insert({
      method: "POST", path: `/auth/${data.event}`, role, user_email: String((context.claims as Record<string, unknown>)?.email ?? "unknown"),
      target_service: "auth", decision: "ALLOW", status_code: 200, reason: data.event === "sign-in" ? "Signed in" : "Signed out", latency_ms: 0,
    });
    return { ok: true };
  });

/** Audit a failed sign-in attempt (no session exists yet). Input is strictly validated. */
export const logFailedSignIn = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; reason: string }) => {
    const email = String(d?.email ?? "").trim().toLowerCase().slice(0, 255);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Bad email");
    return { email, reason: String(d?.reason ?? "").slice(0, 120) };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("gateway_log").insert({ method: "POST", path: "/auth/sign-in", role: null, user_email: data.email, target_service: "auth", decision: "DENY", status_code: 401, reason: data.reason || "Sign-in failed", latency_ms: 0 });
    return { ok: true };
  });
