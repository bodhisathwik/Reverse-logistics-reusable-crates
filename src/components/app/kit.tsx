import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) { el.textContent = value.toLocaleString(); prev.current = value; return; }
    const c = animate(prev.current, value, { duration: 0.8, ease: "easeOut", onUpdate: (v) => { el.textContent = Math.round(v).toLocaleString(); } });
    prev.current = value;
    return () => c.stop();
  }, [value, reduce]);
  return <span ref={ref} className={cn("tabular-nums", className)}>0</span>;
}

const tones = {
  info: "bg-info/12 text-info",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/12 text-danger",
  neutral: "bg-neutral/15 text-muted-foreground",
} as const;
export type Tone = keyof typeof tones;

export function StatCard({ icon, label, value, tone = "info", trend, glow, index = 0 }: {
  icon: ReactNode; label: string; value: number; tone?: Tone; trend?: "up" | "down"; glow?: boolean; index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 7) * 0.05, duration: 0.25 }}
      className={cn("surface-card p-5", glow && "shadow-glow")}
    >
      <div className="flex items-center justify-between">
        <div className={cn("grid size-10 place-items-center rounded-full", tones[tone])}>{icon}</div>
        {trend && (
          <span className={cn("flex items-center text-xs", trend === "up" ? "text-success" : "text-danger")}>
            {trend === "up" ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
          </span>
        )}
      </div>
      <div className="mt-4 text-3xl font-bold tracking-tight text-foreground"><CountUp value={value} /></div>
      <div className="mt-1 text-sm">{label}</div>
    </motion.div>
  );
}

const statusTone: Record<string, string> = {
  AVAILABLE: tones.success, ISSUED: tones.info, PARTIALLY_RETURNED: tones.warning, OVERDUE: tones.danger,
  CLOSED: tones.neutral, DAMAGED: tones.danger, UP: tones.success, DOWN: tones.danger,
  PUBLISHED: tones.info, CONSUMED: tones.success, FAILED: tones.danger, ALLOW: tones.success, DENY: tones.danger,
  deliveryAgent: tones.info, customerDepot: tones.warning,
};
export const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap", statusTone[status] ?? tones.neutral)}>
      <span className={cn("size-1.5 rounded-full bg-current", status === "OVERDUE" && "animate-soft-pulse")} />
      {status.replace("_", " ")}
    </span>
  );
});

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, children, actions, className }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn("surface-card overflow-hidden", className)}>
      {title && (
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-sm font-semibold">{title}</h3>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function SkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {Array.from({ length: cols }).map((_, j) => <div key={j} className="shimmer h-5 rounded-md" />)}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-surface-3"><Inbox className="size-5" /></div>
      <div className="font-semibold text-foreground">{title}</div>
      {hint && <div className="max-w-sm text-sm">{hint}</div>}
    </div>
  );
}

export function ErrorState({ error }: { error: Error }) {
  return (
    <motion.div initial={{ x: 0 }} animate={{ x: [0, -6, 6, -4, 4, 0] }} transition={{ duration: 0.4 }}
      className="m-5 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      {error.message}
    </motion.div>
  );
}

export function Pager({ page, total, onPage, pageSize = 25 }: { page: number; total: number; onPage: (p: number) => void; pageSize?: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t px-5 py-3 text-xs">
      <span>{total.toLocaleString()} rows · page {page + 1} of {pages}</span>
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
        <Button size="icon" variant="ghost" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight /></Button>
      </div>
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-[11px] uppercase tracking-wider">
            {head.map((h) => <th key={h} className="px-5 py-3 font-medium whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody className="[&_tr]:border-b [&_tr:last-child]:border-0 [&_td]:px-5 [&_td]:py-3 [&_td]:whitespace-nowrap">{children}</tbody>
      </table>
    </motion.div>
  );
}

/** Briefly highlights a row when `token` changes (opacity-only overlay). */
export function useFlash(token: unknown) {
  const [on, setOn] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setOn(true);
    const t = setTimeout(() => setOn(false), 900);
    return () => clearTimeout(t);
  }, [token]);
  return on;
}

export function JsonView({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-background p-4 font-mono text-xs leading-relaxed text-foreground/90">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}
export const inputCls = "h-10 w-full rounded-lg border border-input bg-surface-2 px-3 text-sm text-foreground outline-none transition-colors focus:border-primary";
