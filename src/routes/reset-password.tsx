import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { passwordStrength } from "@/lib/domain";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Crate Control Tower" },
      { name: "description", content: "Choose a new password for your Crate Control Tower account." },
      { property: "og:title", content: "Reset password — Crate Control Tower" },
      { property: "og:description", content: "Set a new password for your control tower account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) setReady(true);
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "PASSWORD_RECOVERY") setReady(true); });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (passwordStrength(pw) === 0) { toast.error("Password must be at least 8 characters"); return; }
    if (pw !== confirm) { toast.error("Passwords don't match"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error("Couldn't update password", { description: error.message }); return; }
    toast.success("Password updated");
    nav({ to: "/tower", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="surface-card w-full max-w-md p-6">
        <div className="grid size-10 place-items-center rounded-full bg-primary/12 text-primary"><KeyRound className="size-5" /></div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">Set a new password</h1>
        {!ready ? <p className="mt-2 text-sm">Open this page from the reset link in your email.</p> : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <div className="space-y-1.5"><Label htmlFor="np">New password</Label><Input id="np" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></div>
            <div className="space-y-1.5"><Label htmlFor="nc">Confirm password</Label><Input id="nc" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Update password</Button>
          </form>
        )}
      </div>
    </div>
  );
}
