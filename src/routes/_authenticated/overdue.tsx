import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { AlarmClock } from "lucide-react";
import { useGw } from "@/lib/api";
import { EmptyState, ErrorState, PageHeader, Pager, SkeletonRows, StatusBadge } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/overdue")({
  head: () => ({ meta: [{ title: "Overdue · Crate Control Tower" }, { name: "description", content: "Custodies past due with crates outstanding." }] }),
  component: Overdue,
});

type Rows = { rows: { custody_id: string; depot_id: string; crate_type: string; issued: number; returned: number; outstanding: number; due_date: string }[]; total: number };

function daysLate(d: string) { return Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 864e5)); }

function Overdue() {
  const [page, setPage] = useState(0);
  const q = useGw<Rows>("/balances/custody", { overdue: true, page });
  return (
    <>
      <PageHeader title="Overdue Board" subtitle="Past due date with outstanding crates > 0." />
      {q.isLoading ? <SkeletonRows cols={3} rows={3} /> : q.error ? <ErrorState error={q.error} /> : !q.data?.rows.length ? (
        <div className="surface-card"><EmptyState title="Nothing overdue" hint="Every past-due custody has been fully returned." /></div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {q.data.rows.map((r, i) => (
              <motion.div key={r.custody_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 7) * 0.05 }}
                className="surface-card border-danger/25 p-5">
                <div className="flex items-start justify-between">
                  <div><div className="font-mono text-sm text-foreground">{r.custody_id}</div><div className="text-xs">{r.depot_id} · {r.crate_type}</div></div>
                  <StatusBadge status="OVERDUE" />
                </div>
                <div className="mt-5 flex items-end gap-2"><span className="text-4xl font-bold tracking-tight text-danger">{r.outstanding}</span><span className="pb-1 text-sm">of {r.issued} still out</span></div>
                <div className="mt-3 flex items-center gap-1.5 text-xs"><AlarmClock className="size-3.5" /> due {r.due_date} · {daysLate(r.due_date)}d late</div>
              </motion.div>
            ))}
          </div>
          <div className="surface-card mt-4"><Pager page={page} total={q.data.total} onPage={setPage} /></div>
        </>
      )}
    </>
  );
}
