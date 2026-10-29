import { createFileRoute, Outlet, redirect, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  Radar, PlayCircle, PackagePlus, ScanLine, Scale, AlarmClock, Radio, Shield, Server, Database, Grid3x3, FlaskConical,
  Bell, Tag, Sun, Moon, KeyRound, LogOut, Command as CmdIcon, Menu, Boxes, UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { logAuthEvent, redeemAgentCode } from "@/lib/auth.functions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useGw } from "@/lib/api";
import { emitFlow } from "@/lib/flow";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge, JsonView } from "@/components/app/kit";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
  },
  pendingComponent: ShellSkeleton,
  component: Shell,
});

export const NAV = [
  { to: "/tower", label: "Control Tower", icon: Radar },
  { to: "/demo", label: "Demo Mode", icon: PlayCircle },
  { to: "/custody", label: "Custody", icon: PackagePlus },
  { to: "/returns", label: "Return Scans", icon: ScanLine },
  { to: "/balances", label: "Balances", icon: Scale },
  { to: "/overdue", label: "Overdue", icon: AlarmClock },
  { to: "/labels", label: "Crate Labels", icon: Tag },
  { to: "/events", label: "Event Viewer", icon: Radio },
  { to: "/gateway", label: "Gateway Log", icon: Shield },
  { to: "/registry", label: "Service Registry", icon: Server },
  { to: "/stores", label: "Data Stores", icon: Database },
  { to: "/ownership", label: "Ownership Matrix", icon: Grid3x3 },
  { to: "/tests", label: "Test Runner", icon: FlaskConical },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = pathname.startsWith(n.to);
        return (
          <Link key={n.to} to={n.to} onClick={onNavigate}
            className={cn("relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors", active ? "text-foreground" : "hover:text-foreground")}>
            {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-surface-3 shadow-glow" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
            <n.icon className={cn("relative size-4", active && "text-primary")} />
            <span className="relative">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-3">
      <div className="grid size-8 place-items-center rounded-lg bg-gradient-primary text-primary-foreground"><Boxes className="size-4" /></div>
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-tight text-foreground">Crate Control</div>
        <div className="text-[10px] uppercase tracking-widest">Tower · SOA</div>
      </div>
    </div>
  );
}

function useTheme() {
  const [light, setLight] = useState(false);
  useEffect(() => { setLight(localStorage.getItem("cct-theme") === "light"); }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("light", light);
    localStorage.setItem("cct-theme", light ? "light" : "dark");
  }, [light]);
  return [light, setLight] as const;
}

function Shell() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const auth = useAuth();
  const [light, setLight] = useTheme();
  const [cmd, setCmd] = useState(false);
  const [jwt, setJwt] = useState(false);
  const [mobile, setMobile] = useState(false);

  // Realtime: refresh cached gateway queries + animate the diagram
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    // Debounced; gateway_log inserts only refresh the log view — every gateway call writes a log row,
    // so refreshing everything on it would create an endless request loop.
    const bump = () => { clearTimeout(t); t = setTimeout(() => qc.invalidateQueries({ queryKey: ["gw"], predicate: (q) => q.queryKey[1] !== "/gateway" }), 600); };
    let tl: ReturnType<typeof setTimeout> | undefined;
    const bumpLog = () => { clearTimeout(tl); tl = setTimeout(() => qc.invalidateQueries({ queryKey: ["gw", "/gateway"] }), 1500); };
    const ch = supabase.channel(`cct-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_bus" }, () => { emitFlow("event"); bump(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "balance_depot" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_registry" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "custody_records" }, bump)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gateway_log" }, bumpLog)
      .subscribe();
    return () => { clearTimeout(t); clearTimeout(tl); supabase.removeChannel(ch); };
  }, [qc]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd((v) => !v); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const logEvt = useServerFn(logAuthEvent);
  const redeem = useServerFn(redeemAgentCode);
  // Agent code entered at signup is only a candidate; verified server-side on first sign-in.
  const pendingCode = auth.session?.user.user_metadata?.agent_code as string | undefined;
  useEffect(() => {
    if (!pendingCode || auth.role !== "customerDepot") return;
    redeem({ data: { code: pendingCode } })
      .then(async () => { await supabase.auth.refreshSession(); await auth.refresh(); qc.invalidateQueries(); toast.success("Agent access granted"); })
      .catch(async (e) => { await supabase.auth.updateUser({ data: { agent_code: null } }); toast.error((e as Error).message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCode, auth.role]);

  // Signed out in another tab → leave protected pages.
  useEffect(() => { if (!auth.loading && !auth.session) nav({ to: "/auth", replace: true }); }, [auth.loading, auth.session, nav]);

  async function signOut() {
    await logEvt({ data: { event: "sign-out" } }).catch(() => {});
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  if (auth.loading) return <ShellSkeleton />;

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 print:!hidden flex-col gap-6 border-r bg-surface-1 px-3 py-5 lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto"><SidebarNav /></div>
        <RoleCard onSignOut={signOut} />
      </aside>
      <Sheet open={mobile} onOpenChange={setMobile}>
        <SheetContent side="left" className="w-72 border-r bg-surface-1 p-4">
          <div className="mb-6 mt-2"><Brand /></div>
          <SidebarNav onNavigate={() => setMobile(false)} />
          <div className="mt-6"><RoleCard onSignOut={signOut} /></div>
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64 print:!pl-0">
        <header className="sticky top-0 z-20 flex h-16 print:hidden items-center gap-2 border-b bg-background/90 px-4 sm:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu"><Menu /></Button>
          <button onClick={() => setCmd(true)} className="flex h-9 flex-1 items-center gap-2 rounded-lg border bg-surface-1 px-3 text-sm transition-colors hover:text-foreground sm:max-w-sm">
            <CmdIcon className="size-4" /> <span className="flex-1 text-left">Jump to…</span>
            <kbd className="hidden rounded bg-surface-3 px-1.5 py-0.5 text-[10px] sm:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <OverdueBell />
            <Button variant="ghost" size="icon" onClick={() => setJwt(true)} aria-label="JWT inspector"><KeyRound /></Button>
            <Button variant="ghost" size="icon" onClick={() => setLight(!light)} aria-label="Toggle theme">{light ? <Moon /> : <Sun />}</Button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
          <motion.div key={pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Outlet />
          </motion.div>
        </main>
      </div>

      <CommandDialog open={cmd} onOpenChange={setCmd}>
        <CommandInput placeholder="Search pages and actions…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Pages">
            {NAV.map((n) => (
              <CommandItem key={n.to} onSelect={() => { setCmd(false); nav({ to: n.to }); }}>
                <n.icon className="mr-2 size-4" /> {n.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Demo">
            {[1, 2, 3, 4, 5, 6, 7].map((s) => (
              <CommandItem key={s} onSelect={() => { setCmd(false); nav({ to: "/demo", search: { step: s } }); }}>
                <PlayCircle className="mr-2 size-4" /> Run demo step {s}
              </CommandItem>
            ))}
            <CommandItem onSelect={() => { setCmd(false); setJwt(true); }}><KeyRound className="mr-2 size-4" /> Open JWT inspector</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <Dialog open={jwt} onOpenChange={setJwt}>
        <DialogContent className="glass max-w-2xl rounded-2xl">
          <DialogHeader><DialogTitle>JWT inspector</DialogTitle></DialogHeader>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            Role claim: {auth.role ? <StatusBadge status={auth.role} /> : "none"}
            {auth.depotId && <span>· depot <b className="text-foreground">{auth.depotId}</b></span>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto"><JsonView value={auth.claims} /></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoleCard({ onSignOut }: { onSignOut: () => void }) {
  const auth = useAuth();
  return (
    <div className="surface-panel p-3">
      <Link to="/profile" className="flex items-center gap-2.5">
        <Avatar className="size-9">
          {auth.profile?.avatar_url && <AvatarImage src={auth.profile.avatar_url} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback className="bg-surface-3 text-xs font-semibold text-foreground">{initials(auth.profile?.full_name || auth.session?.user.email || "?")}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{auth.profile?.full_name || "Unnamed"}</div>
          <div className="truncate text-xs">{auth.session?.user.email}</div>
        </div>
      </Link>
      <div className="mt-2 flex items-center justify-between">
        {auth.role && <StatusBadge status={auth.role} />}
        <Button variant="ghost" size="sm" onClick={onSignOut}><LogOut /> Sign out</Button>
      </div>
    </div>
  );
}

function OverdueBell() {
  const { data } = useGw<{ rows: { custody_id: string; depot_id: string; outstanding: number; due_date: string }[]; total: number }>("/balances/custody", { overdue: true });
  const count = data?.total ?? 0;
  const prev = useRef<number | null>(null);
  const [wiggle, setWiggle] = useState(0);
  useEffect(() => {
    if (prev.current !== null && count > prev.current) setWiggle((w) => w + 1);
    prev.current = count;
  }, [count]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Overdue alerts">
          <motion.span key={wiggle} animate={wiggle ? { rotate: [0, -18, 14, -10, 6, 0] } : {}} transition={{ duration: 0.6 }}><Bell /></motion.span>
          {count > 0 && <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-danger text-[9px] font-bold text-destructive-foreground">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="glass w-80 rounded-xl p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold text-foreground">Overdue alerts</div>
        {count === 0 ? <div className="px-4 py-6 text-sm">Nothing overdue. 🎉</div> : (
          <ul className="max-h-72 overflow-y-auto">
            {data!.rows.map((r) => (
              <li key={r.custody_id} className="flex items-center justify-between border-b px-4 py-3 text-sm last:border-0">
                <div><div className="font-medium text-foreground">{r.custody_id}</div><div className="text-xs">{r.depot_id} · due {r.due_date}</div></div>
                <span className="font-semibold text-danger">{r.outstanding} out</span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function initials(s: string) {
  return s.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-3 border-r bg-surface-1 p-5 lg:flex">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
      </aside>
      <div className="lg:pl-64">
        <div className="h-16 border-b" />
        <div className="mx-auto max-w-7xl space-y-4 px-4 py-10 sm:px-8">
          <Skeleton className="h-9 w-64" />
          <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
          <Skeleton className="h-72" />
        </div>
      </div>
    </div>
  );
}
