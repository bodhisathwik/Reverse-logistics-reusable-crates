import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { GatewayResponse } from "./domain";
import type { TestResult } from "./tests.types";
import { DEMO_PASSWORD } from "./demo";

type GwInput = { method: "GET" | "POST"; path: string; body?: Record<string, unknown> };

async function buildCtx(context: { supabase: unknown; userId: string; claims: Record<string, unknown> }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userDb = context.supabase as any;
  const { data: roles } = await userDb.from("user_roles").select("role, depot_id").eq("user_id", context.userId);
  const r = roles?.find((x: { role: string }) => x.role === "deliveryAgent") ?? roles?.[0];
  return {
    userDb,
    admin: supabaseAdmin,
    role: (r?.role ?? null) as "deliveryAgent" | "customerDepot" | null,
    depotId: (r?.depot_id ?? null) as string | null,
    email: String(context.claims?.email ?? "unknown"),
  };
}

/** Single entry point for every API call (the API Gateway). */
export const gatewayCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: GwInput) => {
    if (!d || (d.method !== "GET" && d.method !== "POST") || typeof d.path !== "string") throw new Error("Bad request");
    return d;
  })
  .handler(async ({ data, context }): Promise<GatewayResponse> => {
    const { dispatch } = await import("./gateway.server");
    const ctx = await buildCtx(context as never);
    return dispatch(ctx, data.method, data.path, data.body ?? {});
  });

export const runTestSuite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult[]> => {
    const ctx = await buildCtx(context as never);
    if (ctx.role !== "deliveryAgent") throw new Error("Only delivery agents can run the test suite");
    const { runAllTests } = await import("./tests.server");
    return runAllTests(ctx.admin);
  });

const DEMO = {
  deliveryAgent: { email: "agent@cratetower.demo", depot: null as string | null, name: "Ravi Kumar" },
  customerDepot: { email: "depot@cratetower.demo", depot: "DEP-001" as string | null, name: "FreshMart Central" },
};

/** Idempotently provisions the two synthetic demo accounts. Only ever creates these fixed accounts. */
export const ensureDemoUser = createServerFn({ method: "POST" })
  .inputValidator((d: { role: "deliveryAgent" | "customerDepot" }) => {
    if (d?.role !== "deliveryAgent" && d?.role !== "customerDepot") throw new Error("Bad role");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cfg = DEMO[data.role];
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let user = list?.users.find((u) => u.email === cfg.email);
    if (!user) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: cfg.email, password: DEMO_PASSWORD, email_confirm: true,
        app_metadata: { role: data.role, depot_id: cfg.depot },
        user_metadata: { display_name: cfg.name },
      });
      if (error) throw new Error(error.message);
      user = created.user!;
    }
    await supabaseAdmin.from("user_roles").upsert({ user_id: user.id, role: data.role, depot_id: cfg.depot }, { onConflict: "user_id,role" });
    return { email: cfg.email };
  });

/** Demo step 6: performs a real sign-in as the customerDepot user server-side and sends an agent-only call with that JWT. */
export const demoDepotDenied = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await buildCtx(context as never);
    if (caller.role !== "deliveryAgent") throw new Error("Run the demo as a delivery agent");
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const shim = (token?: string) => (input: RequestInfo | URL, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
      if (token) h.set("Authorization", `Bearer ${token}`);
      h.set("apikey", key);
      return fetch(input, { ...init, headers: h });
    };
    const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim() } });
    const { data: s, error } = await anon.auth.signInWithPassword({ email: "depot@cratetower.demo", password: DEMO_PASSWORD });
    if (error || !s.session) throw new Error("Depot sign-in failed: " + (error?.message ?? "no session"));
    const token = s.session.access_token;
    const userDb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(token) } });
    const claims = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString());
    const ctx = await buildCtx({ supabase: userDb, userId: s.user!.id, claims });
    const { dispatch } = await import("./gateway.server");
    const res = await dispatch(ctx, "POST", "/custody/issue", { depot_id: "DEP-001", agent_id: "AGT-01", crate_type: "BLUE40", qty: 10, due_date: "2030-01-01" });
    return { response: res, claims: { sub: claims.sub, email: claims.email, role: claims.role, app_metadata: claims.app_metadata, exp: claims.exp } };
  });
