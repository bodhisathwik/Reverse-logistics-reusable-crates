import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Boxes, Truck, Store, Loader2, Eye, EyeOff, MailCheck, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { ensureDemoUser } from "@/lib/gateway.functions";
import { logAuthEvent, logFailedSignIn } from "@/lib/auth.functions";
import { DEMO_EMAILS, DEMO_PASSWORD } from "@/lib/demo";
import { passwordStrength, safeRedirect, type Role } from "@/lib/domain";
import { useAuth } from "@/hooks/use-auth";
import { GoogleLogo } from "@/components/app/GoogleLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => (typeof s.redirect === "string" ? { redirect: s.redirect } : {}),
  head: () => ({
    meta: [
      { title: "Sign in — Crate Control Tower" },
      { name: "description", content: "Sign in or create an account to manage crate custody, returns and depot balances." },
      { property: "og:title", content: "Sign in — Crate Control Tower" },
      { property: "og:description", content: "Secure access to the reverse-logistics control tower for reusable crates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const emailS = z.string().trim().email("Enter a valid email").max(255);
const signUpS = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: emailS,
  password: z.string().min(8, "At least 8 characters").max(72),
  confirm: z.string(),
  depot: z.string().optional(),
  code: z.string().trim().max(32).regex(/^[A-Za-z0-9-]*$/, "Letters, numbers and dashes only").optional(),
}).refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" })
  .refine((v) => !!v.code || !!v.depot, { path: ["depot"], message: "Choose your depot" });

function friendly(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Wrong email or password.";
  if (m.includes("already registered") || m.includes("already exists")) return "That email is already registered — try signing in.";
  if (m.includes("rate") || m.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("not confirmed")) return "Please confirm your email first — check your inbox.";
  if (m.includes("fetch") || m.includes("network")) return "Network error — check your connection.";
  return msg;
}

function AuthPage() {
  const nav = useNavigate();
  const search = Route.useSearch();
  const auth = useAuth();
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<"in" | "up" | "forgot">("in");
  const [inbox, setInbox] = useState<string | null>(null);
  const dest = safeRedirect(search.redirect);

  useEffect(() => { if (!auth.loading && auth.session) nav({ to: dest, replace: true }); }, [auth.loading, auth.session, dest, nav]);

  const t = reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.18 } };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow"><Boxes className="size-6" /></div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground">Crate Control Tower</h1>
          <p className="mt-1 text-sm">Every crate delivered, every crate returned.</p>
        </div>
        <div className="surface-card p-6">
          <AnimatePresence mode="wait">
            {inbox ? (
              <motion.div key="inbox" {...t}><CheckInbox email={inbox} onBack={() => { setInbox(null); setTab("in"); }} /></motion.div>
            ) : tab === "forgot" ? (
              <motion.div key="forgot" {...t}><Forgot onBack={() => setTab("in")} /></motion.div>
            ) : (
              <motion.div key="main" {...t}>
                <Tabs value={tab} onValueChange={(v) => setTab(v as "in" | "up")}>
                  <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="in">Sign in</TabsTrigger><TabsTrigger value="up">Create account</TabsTrigger></TabsList>
                </Tabs>
                <GoogleButton />
                <div className="my-5 flex items-center gap-3 text-xs"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
                {tab === "in" ? <SignIn onForgot={() => setTab("forgot")} onUnconfirmed={setInbox} /> : <SignUp onDone={setInbox} />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <DemoAccounts />
      </div>
    </div>
  );
}

function GoogleButton() {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) { toast.error("Google sign-in failed", { description: friendly(r.error.message) }); setBusy(false); return; }
    if (r.redirected) return;
    setBusy(false);
  }
  return (
    <Button type="button" variant="outline" className="mt-5 w-full gap-2 bg-surface-1" onClick={go} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <GoogleLogo />} Continue with Google
    </Button>
  );
}

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className="pr-10" />
      <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 grid w-10 place-items-center hover:text-foreground" aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function Err({ msg }: { msg?: string }) { return msg ? <p className="text-xs text-danger">{msg}</p> : null; }

function SignIn({ onForgot, onUnconfirmed }: { onForgot: () => void; onUnconfirmed: (e: string) => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const logIn = useServerFn(logAuthEvent);
  const logFail = useServerFn(logFailedSignIn);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ve = emailS.safeParse(email);
    const n: Record<string, string> = {};
    if (!ve.success) n.email = ve.error.issues[0].message;
    if (!pw) n.password = "Enter your password";
    setErrs(n);
    if (Object.keys(n).length) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: ve.data!, password: pw });
    setBusy(false);
    if (error) {
      void logFail({ data: { email: ve.data!, reason: error.message } }).catch(() => {});
      if (error.message.toLowerCase().includes("not confirmed")) { onUnconfirmed(ve.data!); return; }
      toast.error("Sign-in failed", { description: friendly(error.message) });
      return;
    }
    void logIn({ data: { event: "sign-in" } }).catch(() => {});
    toast.success("Welcome back");
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5"><Label htmlFor="si-email">Email</Label><Input id="si-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /><Err msg={errs.email} /></div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between"><Label htmlFor="si-pw">Password</Label><button type="button" onClick={onForgot} className="text-xs text-primary hover:underline">Forgot password?</button></div>
        <PasswordInput id="si-pw" value={pw} onChange={setPw} autoComplete="current-password" /><Err msg={errs.password} />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Sign in</Button>
    </form>
  );
}

function useDepots() {
  const [depots, setDepots] = useState<{ id: string; name: string; city: string }[]>([]);
  useEffect(() => { supabase.rpc("list_depots").then(({ data }) => setDepots(data ?? [])); }, []);
  return depots;
}

function SignUp({ onDone }: { onDone: (email: string) => void }) {
  const depots = useDepots();
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "", depot: "", code: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const strength = passwordStrength(f.password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = signUpS.safeParse({ ...f, depot: f.depot || undefined, code: f.code || undefined });
    if (!r.success) { setErrs(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]))); return; }
    setErrs({});
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: r.data.email, password: r.data.password,
      options: {
        emailRedirectTo: window.location.origin + "/auth",
        // Candidate values only — the depot is validated by a DB trigger and the agent code is verified server-side.
        data: { full_name: r.data.name, depot_id: r.data.depot ?? null, agent_code: r.data.code?.toUpperCase() ?? null },
      },
    });
    setBusy(false);
    if (error) { toast.error("Couldn't create account", { description: friendly(error.message) }); return; }
    if (data.user && data.user.identities?.length === 0) { toast.error("Couldn't create account", { description: friendly("already registered") }); return; }
    onDone(r.data.email);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5"><Label htmlFor="su-name">Full name</Label><Input id="su-name" value={f.name} onChange={(e) => set("name")(e.target.value)} autoComplete="name" /><Err msg={errs.name} /></div>
      <div className="space-y-1.5"><Label htmlFor="su-email">Email</Label><Input id="su-email" type="email" value={f.email} onChange={(e) => set("email")(e.target.value)} autoComplete="email" /><Err msg={errs.email} /></div>
      <div className="space-y-1.5">
        <Label htmlFor="su-pw">Password</Label><PasswordInput id="su-pw" value={f.password} onChange={set("password")} autoComplete="new-password" />
        <div className="flex gap-1" aria-label={`Password strength ${strength} of 4`}>
          {[1, 2, 3, 4].map((i) => <span key={i} className={cn("h-1 flex-1 rounded-full bg-surface-3 transition-colors", strength >= i && (strength <= 1 ? "bg-danger" : strength === 2 ? "bg-warning" : "bg-success"))} />)}
        </div>
        <Err msg={errs.password} />
      </div>
      <div className="space-y-1.5"><Label htmlFor="su-confirm">Confirm password</Label><PasswordInput id="su-confirm" value={f.confirm} onChange={set("confirm")} autoComplete="new-password" /><Err msg={errs.confirm} /></div>
      <div className="space-y-1.5">
        <Label>Depot</Label>
        <Select value={f.depot} onValueChange={set("depot")}>
          <SelectTrigger><SelectValue placeholder="Select your depot" /></SelectTrigger>
          <SelectContent>{depots.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} · {d.city}</SelectItem>)}</SelectContent>
        </Select>
        <Err msg={errs.depot} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-code">Agent access code <span className="font-normal">(optional)</span></Label>
        <Input id="su-code" value={f.code} onChange={(e) => set("code")(e.target.value)} placeholder="Only for delivery agents" />
        <Err msg={errs.code} />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Create account</Button>
    </form>
  );
}

function Forgot({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = emailS.safeParse(email);
    if (!v.success) { toast.error(v.error.issues[0].message); return; }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(v.data, { redirectTo: window.location.origin + "/reset-password" });
    setBusy(false);
    if (error) { toast.error("Couldn't send link", { description: friendly(error.message) }); return; }
    setSent(true);
  }
  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-1 text-xs hover:text-foreground"><ArrowLeft className="size-3" /> Back to sign in</button>
      <h2 className="text-lg font-semibold text-foreground">Reset your password</h2>
      {sent ? <p className="mt-2 text-sm">If an account exists for <b className="text-foreground">{email}</b>, a reset link is on its way.</p> : (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="space-y-1.5"><Label htmlFor="fp-email">Email</Label><Input id="fp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Send reset link</Button>
        </form>
      )}
    </div>
  );
}

function CheckInbox({ email, onBack }: { email: string; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  async function resend() {
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: window.location.origin + "/auth" } });
    setBusy(false);
    if (error) toast.error("Couldn't resend", { description: friendly(error.message) }); else toast.success("Confirmation email sent again");
  }
  return (
    <div className="text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-success/12 text-success"><MailCheck className="size-6" /></div>
      <h2 className="mt-4 text-lg font-semibold text-foreground">Check your inbox</h2>
      <p className="mt-2 text-sm">We sent a confirmation link to <b className="text-foreground">{email}</b>. Click it to activate your account.</p>
      <div className="mt-6 flex flex-col gap-2">
        <Button variant="outline" onClick={resend} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Resend email</Button>
        <Button variant="ghost" onClick={onBack}>Back to sign in</Button>
      </div>
    </div>
  );
}

function DemoAccounts() {
  const ensure = useServerFn(ensureDemoUser);
  const logIn = useServerFn(logAuthEvent);
  const [busy, setBusy] = useState<Role | null>(null);
  async function login(role: Role) {
    setBusy(role);
    try {
      await ensure({ data: { role } });
      const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAILS[role], password: DEMO_PASSWORD });
      if (error) throw error;
      void logIn({ data: { event: "sign-in" } }).catch(() => {});
      toast.success(role === "deliveryAgent" ? "Signed in as Delivery Agent" : "Signed in as Customer Depot");
    } catch (e) {
      toast.error("Sign-in failed", { description: friendly((e as Error).message) });
    } finally { setBusy(null); }
  }
  return (
    <div className="mt-6">
      <div className="mb-3 text-center text-[11px] uppercase tracking-widest">Demo accounts · synthetic data</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button onClick={() => login("deliveryAgent")} disabled={!!busy} className="surface-card flex items-center gap-3 p-3 text-left transition-transform active:scale-[0.97] disabled:opacity-60">
          <span className="grid size-9 place-items-center rounded-full bg-info/12 text-info">{busy === "deliveryAgent" ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}</span>
          <span><span className="block text-sm font-semibold text-foreground">Delivery Agent</span><span className="text-xs">Full access</span></span>
        </button>
        <button onClick={() => login("customerDepot")} disabled={!!busy} className="surface-card flex items-center gap-3 p-3 text-left transition-transform active:scale-[0.97] disabled:opacity-60">
          <span className="grid size-9 place-items-center rounded-full bg-warning/12 text-warning">{busy === "customerDepot" ? <Loader2 className="size-4 animate-spin" /> : <Store className="size-4" />}</span>
          <span><span className="block text-sm font-semibold text-foreground">Customer Depot</span><span className="text-xs">FreshMart Central</span></span>
        </button>
      </div>
      <p className="mt-3 text-center text-xs">Demo agent access code: <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-foreground">AGENT-2026</code></p>
    </div>
  );
}
