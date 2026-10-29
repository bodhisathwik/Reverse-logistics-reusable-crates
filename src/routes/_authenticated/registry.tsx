import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Server } from "lucide-react";
import { toast } from "sonner";
import { useGateway, useGw } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { ErrorState, PageHeader, SkeletonRows, StatusBadge } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/registry")({
  head: () => ({ meta: [{ title: "Service Registry · Crate Control Tower" }, { name: "description", content: "Registered service instances and health." }] }),
  component: Registry,
});

type Row = { name: string; instance_id: string; url: string; status: string; last_heartbeat: string };

function Registry() {
  const { role } = useAuth();
  const q = useGw<{ rows: Row[] }>("/registry");
  const call = useGateway();
  const qc = useQueryClient();
  async function toggle(r: Row, up: boolean) {
    const res = await call<{ drained: number }>("POST", "/registry/toggle", { name: r.name, status: up ? "UP" : "DOWN" });
    if (res.ok) toast[up ? "success" : "warning"](`${r.name} is ${up ? "UP" : "DOWN"}`, { description: res.data!.drained ? `Drained ${res.data!.drained} queued events` : undefined });
    else toast.error(`${res.status} · ${res.error}`);
    qc.invalidateQueries({ queryKey: ["gw"] });
  }
  return (
    <>
      <PageHeader title="Service Registry" subtitle="The gateway resolves every service here before routing. Kill one to see 503s; revive ReturnBalance to drain queued events." />
      {q.isLoading ? <SkeletonRows cols={3} rows={3} /> : q.error ? <ErrorState error={q.error} /> : (
        <div className="grid gap-4 md:grid-cols-3">
          {q.data!.rows.map((r, i) => (
            <motion.div key={r.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="surface-card p-5">
              <div className="flex items-center justify-between">
                <div className="grid size-10 place-items-center rounded-full bg-info/12 text-info"><Server className="size-5" /></div>
                <StatusBadge status={r.status} />
              </div>
              <div className="mt-4 font-semibold text-foreground">{r.name}</div>
              <div className="mt-1 font-mono text-xs">{r.instance_id}</div>
              <div className="font-mono text-xs">{r.url}</div>
              <div className="mt-1 text-xs">heartbeat {new Date(r.last_heartbeat).toLocaleTimeString()}</div>
              {role === "deliveryAgent" && (
                <label className="mt-5 flex items-center justify-between border-t pt-4 text-sm">
                  {r.status === "UP" ? "Running" : "Killed"}
                  <Switch checked={r.status === "UP"} onCheckedChange={(v) => toggle(r, v)} />
                </label>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
}
