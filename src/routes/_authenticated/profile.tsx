import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { redeemAgentCode, chooseMyDepot, logAuthEvent } from "@/lib/auth.functions";
import { passwordStrength } from "@/lib/domain";
import { StatusBadge } from "@/components/app/kit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Crate Control Tower" }, { name: "description", content: "Your account, role and depot." }] }),
  component: Profile,
});

function Profile() {
  const auth = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const redeem = useServerFn(redeemAgentCode);
  const pickDepot = useServerFn(chooseMyDepot);
  const logEvt = useServerFn(logAuthEvent);
  const [name, setName] = useState("");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [depot, setDepot] = useState("");
  const [depots, setDepots] = useState<{ id: string; name: string; city: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { setName(auth.profile?.full_name ?? ""); }, [auth.profile?.full_name]);
  useEffect(() => { supabase.rpc("list_depots").then(({ data }) => setDepots(data ?? [])); }, []);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }
  const saveName = (e: FormEvent) => { e.preventDefault(); run("name", async () => {
    const n = name.trim();
    if (!n || n.length > 100) throw new Error("Name must be 1–100 characters");
    const { error } = await supabase.from("profiles").update({ full_name: n }).eq("id", auth.session!.user.id);
    if (error) throw error;
    await auth.refresh(); toast.success("Name updated");
  }); };
  const changePw = (e: FormEvent) => { e.preventDefault(); run("pw", async () => {
    if (passwordStrength(pw) === 0) throw new Error("New password must be at least 8 characters");
    const { error } = await supabase.auth.updateUser({ password: pw, current_password: cur } as never);
    if (error) throw error;
    setCur(""); setPw(""); toast.success("Password changed");
  }); };
  const doRedeem = (e: FormEvent) => { e.preventDefault(); run("code", async () => {
    await redeem({ data: { code } }); await supabase.auth.refreshSession(); await auth.refresh(); qc.invalidateQueries(); setCode("");
    toast.success("You're now a Delivery Agent");
  }); };
  const doDepot = () => run("depot", async () => {
    await pickDepot({ data: { depotId: depot } }); await supabase.auth.refreshSession(); await auth.refresh(); qc.invalidateQueries();
    toast.success("Depot assigned");
  });
  const signOutAll = () => run("all", async () => {
    await logEvt({ data: { event: "sign-out" } }).catch(() => {});
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut({ scope: "global" });
    nav({ to: "/auth", replace: true });
  });

  const hasPw = auth.session?.user.identities?.some((i) => i.provider === "email");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Profile</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface-card space-y-4 p-6">
          <h2 className="font-semibold text-foreground">Account</h2>
          <div className="text-sm">Email: <b className="text-foreground">{auth.session?.user.email}</b></div>
          <div className="flex items-center gap-2 text-sm">Role: {auth.role ? <StatusBadge status={auth.role} /> : "—"}</div>
          <div className="text-sm">Depot: <b className="text-foreground">{auth.depotId ?? (auth.role === "deliveryAgent" ? "All depots" : "Not assigned")}</b></div>
          <form onSubmit={saveName} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5"><Label htmlFor="pf-name">Full name</Label><Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></div>
            <Button type="submit" disabled={busy === "name"}>{busy === "name" && <Loader2 className="animate-spin" />} Save</Button>
          </form>
        </section>

        {auth.role === "customerDepot" && !auth.depotId && (
          <section className="surface-card space-y-4 p-6">
            <h2 className="font-semibold text-foreground">Choose your depot</h2>
            <p className="text-sm">You'll only see this depot's records. This can be set once.</p>
            <Select value={depot} onValueChange={setDepot}>
              <SelectTrigger><SelectValue placeholder="Select depot" /></SelectTrigger>
              <SelectContent>{depots.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} · {d.city}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={doDepot} disabled={!depot || busy === "depot"}>{busy === "depot" && <Loader2 className="animate-spin" />} Assign depot</Button>
          </section>
        )}

        {auth.role !== "deliveryAgent" && (
          <section className="surface-card space-y-4 p-6">
            <h2 className="font-semibold text-foreground">Agent access</h2>
            <p className="text-sm">Have an agent access code? Enter it to become a Delivery Agent.</p>
            <form onSubmit={doRedeem} className="flex gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AGENT-XXXX" maxLength={32} />
              <Button type="submit" disabled={!code || busy === "code"}>{busy === "code" && <Loader2 className="animate-spin" />} Redeem</Button>
            </form>
          </section>
        )}

        {hasPw && (
          <section className="surface-card space-y-4 p-6">
            <h2 className="font-semibold text-foreground">Change password</h2>
            <form onSubmit={changePw} className="space-y-3">
              <div className="space-y-1.5"><Label htmlFor="pf-cur">Current password</Label><Input id="pf-cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></div>
              <div className="space-y-1.5"><Label htmlFor="pf-new">New password</Label><Input id="pf-new" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></div>
              <Button type="submit" disabled={busy === "pw"}>{busy === "pw" && <Loader2 className="animate-spin" />} Change password</Button>
            </form>
          </section>
        )}

        <section className="surface-card space-y-4 p-6">
          <h2 className="font-semibold text-foreground">Sessions</h2>
          <p className="text-sm">Sign out from every device and browser where you're signed in.</p>
          <Button variant="destructive" onClick={signOutAll} disabled={busy === "all"}>{busy === "all" && <Loader2 className="animate-spin" />} Sign out of all devices</Button>
        </section>
      </div>
    </div>
  );
}
