import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/lib/domain";

interface Profile { full_name: string | null; email: string | null; avatar_url: string | null }
interface AuthState {
  session: Session | null;
  loading: boolean;
  role: Role | null;
  depotId: string | null;
  profile: Profile | null;
  claims: Record<string, unknown> | null;
  refresh: () => Promise<void>;
}
const Ctx = createContext<AuthState>({ session: null, loading: true, role: null, depotId: null, profile: null, claims: null, refresh: async () => {} });

export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const p = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(p))));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);
  const [depotId, setDepotId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Role + depot come from the user_roles table (RLS: own rows only), never from client storage.
  const load = useCallback(async (s: Session | null) => {
    if (!s) { setRole(null); setDepotId(null); setProfile(null); return; }
    const [{ data: roles }, { data: prof }] = await Promise.all([
      supabase.from("user_roles").select("role, depot_id").eq("user_id", s.user.id),
      supabase.from("profiles").select("full_name, email, avatar_url").eq("id", s.user.id).maybeSingle(),
    ]);
    const r = roles?.find((x) => x.role === "deliveryAgent") ?? roles?.[0];
    setRole((r?.role as Role) ?? null);
    setDepotId(r?.depot_id ?? null);
    setProfile(prof ?? null);
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setTimeout(() => { void load(s); }, 0);
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await load(data.session);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const claims = session ? decodeJwt(session.access_token) : null;
  return (
    <Ctx.Provider value={{ session, loading, claims, role, depotId, profile, refresh: () => load(session) }}>
      {children}
    </Ctx.Provider>
  );
}
export const useAuth = () => useContext(Ctx);
