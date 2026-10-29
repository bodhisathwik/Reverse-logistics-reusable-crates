import { createFileRoute } from "@tanstack/react-router";
import { memo, useState } from "react";
import { motion } from "framer-motion";
import { useGw } from "@/lib/api";
import { EmptyState, ErrorState, PageHeader, Pager, Panel, SkeletonRows, StatusBadge, Table, useFlash } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/balances")({
  head: () => ({ meta: [{ title: "Balances · Crate Control Tower" }, { name: "description", content: "Reconciled crate balances per depot." }] }),
  component: Balances,
});

type Dep = { depot_id: string; depot_name: string; issued: number; returned: number; outstanding: number; overdue_count: number; updated_at: string };
type Cus = { rows: { custody_id: string; depot_id: string; crate_type: string; issued: number; returned: number; outstanding: number; status: string; overdue: boolean; last_event_offset: number }[]; total: number };

const DepotRow = memo(function DepotRow({ r }: { r: Dep }) {
  const flash = useFlash(r.updated_at);
  return (
    <tr className="relative">
      <td className="relative text-foreground">
        <motion.span aria-hidden className="pointer-events-none absolute inset-0 bg-primary/15" initial={false} animate={{ opacity: flash ? 1 : 0 }} transition={{ duration: 0.4 }} />
        <span className="relative font-medium">{r.depot_name}</span> <span className="relative text-xs">{r.depot_id}</span>
      </td>
      <td className="tabular-nums">{r.issued}</td>
      <td className="tabular-nums text-success">{r.returned}</td>
      <td className="tabular-nums text-lg font-bold text-warning">{r.outstanding}</td>
      <td>{r.overdue_count > 0 ? <StatusBadge status="OVERDUE" /> : <span className="text-xs">—</span>} {r.overdue_count > 0 && <span className="text-xs">×{r.overdue_count}</span>}</td>
    </tr>
  );
});

function Balances() {
  const [page, setPage] = useState(0);
  const dep = useGw<{ rows: Dep[] }>("/balances");
  const cus = useGw<Cus>("/balances/custody", { page });
  return (
    <>
      <PageHeader title="Customer Balances" subtitle="Maintained by the ReturnBalance service from consumed events — never read from custody tables directly." />
      <Panel title="By depot">
        {dep.isLoading ? <SkeletonRows cols={5} rows={3} /> : dep.error ? <ErrorState error={dep.error} /> : (
          <Table head={["Depot", "Issued", "Returned", "Outstanding", "Overdue"]}>
            {dep.data!.rows.map((r) => <DepotRow key={r.depot_id} r={r} />)}
          </Table>
        )}
      </Panel>
      <Panel title="By custody" className="mt-6">
        {cus.isLoading ? <SkeletonRows cols={7} /> : cus.error ? <ErrorState error={cus.error} /> : !cus.data?.rows.length ? <EmptyState title="No balances" /> : (
          <>
            <Table head={["Custody", "Depot", "Type", "Issued", "Returned", "Outstanding", "Status", "Last event"]}>
              {cus.data.rows.map((r) => (
                <tr key={r.custody_id}>
                  <td className="font-mono text-xs text-foreground">{r.custody_id}</td><td>{r.depot_id}</td><td>{r.crate_type}</td>
                  <td className="tabular-nums">{r.issued}</td><td className="tabular-nums text-success">{r.returned}</td>
                  <td className="tabular-nums font-semibold text-foreground">{r.outstanding}</td>
                  <td className="flex gap-1.5"><StatusBadge status={r.status} />{r.overdue && <StatusBadge status="OVERDUE" />}</td>
                  <td className="font-mono text-xs">#{r.last_event_offset}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} total={cus.data.total} onPage={setPage} />
          </>
        )}
      </Panel>
    </>
  );
}
