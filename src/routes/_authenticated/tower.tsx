import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Boxes, PackageOpen, AlarmClock, Radio } from "lucide-react";
import { useGw } from "@/lib/api";
import { PageHeader, Panel, StatCard } from "@/components/app/kit";
import { Diagram } from "@/components/app/Diagram";

const BalanceChart = lazy(() => import("@/components/app/BalanceChart"));

export const Route = createFileRoute("/_authenticated/tower")({
  head: () => ({ meta: [{ title: "Control Tower · Crate Control Tower" }, { name: "description", content: "Live architecture and crate KPIs." }] }),
  component: Tower,
});

type Stats = { cratesOut: number; outstanding: number; overdue: number; eventsProcessed: number };
type Bal = { rows: { depot_id: string; depot_name: string; issued: number; returned: number; outstanding: number }[] };
type Reg = { rows: { name: string; status: string }[] };

function Tower() {
  const stats = useGw<Stats>("/stats");
  const bal = useGw<Bal>("/balances");
  const reg = useGw<Reg>("/registry");
  const status = Object.fromEntries((reg.data?.rows ?? []).map((r) => [r.name, r.status]));
  const s = stats.data;
  return (
    <>
      <PageHeader title="Control Tower" subtitle="Requests enter through the gateway, services coordinate through the event bus. Watch the flow live." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard index={0} glow icon={<Boxes className="size-5" />} label="Crates out" value={s?.cratesOut ?? 0} tone="info" trend="up" />
        <StatCard index={1} icon={<PackageOpen className="size-5" />} label="Outstanding total" value={s?.outstanding ?? 0} tone="warning" />
        <StatCard index={2} icon={<AlarmClock className="size-5" />} label="Overdue custodies" value={s?.overdue ?? 0} tone="danger" trend="down" />
        <StatCard index={3} icon={<Radio className="size-5" />} label="Events processed" value={s?.eventsProcessed ?? 0} tone="success" trend="up" />
      </div>
      <Panel title="Live architecture" className="mt-6" actions={<span className="text-xs">blue = request · amber = event · red = denied</span>}>
        <div className="p-4 sm:p-6"><Diagram status={status} /></div>
      </Panel>
      <Panel title="Depot balances" className="mt-6">
        <div className="p-4">
          <Suspense fallback={<div className="shimmer h-[260px] rounded-lg" />}>
            {bal.data ? <BalanceChart data={bal.data.rows} />
              : bal.isError ? <div className="grid h-[260px] place-items-center text-sm">Couldn't load balances. <button className="text-primary underline" onClick={() => bal.refetch()}>Retry</button></div>
              : <div className="shimmer h-[260px] rounded-lg" />}
          </Suspense>
        </div>
      </Panel>
    </>
  );
}
