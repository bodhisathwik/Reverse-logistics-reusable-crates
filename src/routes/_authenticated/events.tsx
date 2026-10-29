import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Bug } from "lucide-react";
import { toast } from "sonner";
import { useGateway, useGw } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, JsonView, PageHeader, Pager, Panel, SkeletonRows, StatusBadge, Table } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/events")({
  head: () => ({ meta: [{ title: "Event Viewer · Crate Control Tower" }, { name: "description", content: "Messages on soa.s06.t06.events." }] }),
  component: Events,
});

export type Ev = { offset: number; key: string; event_type: string; payload: unknown; producer: string; consumer: string | null; status: string; error: string | null; created_at: string };

function Events() {
  const [page, setPage] = useState(0);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const q = useGw<{ rows: Ev[]; total: number }>("/events", { page });
  const call = useGateway();
  const qc = useQueryClient();
  async function malformed() {
    const r = await call("POST", "/events/malformed");
    if (r.ok) toast.warning("Malformed event published — rejected as FAILED"); else toast.error(`${r.status} · ${r.error}`);
    qc.invalidateQueries({ queryKey: ["gw"] });
  }
  return (
    <>
      <PageHeader title="Event Viewer" subtitle="Topic soa.s06.t06.events — producer: custody-service · consumer: return-balance-service."
        actions={<Button variant="outline" onClick={malformed}><Bug /> Publish malformed event</Button>} />
      <Panel>
        {q.isLoading ? <SkeletonRows cols={6} /> : q.error ? <ErrorState error={q.error} /> : !q.data?.rows.length ? <EmptyState title="Topic is empty" /> : (
          <>
            <Table head={["", "Offset", "Key", "Type", "Producer", "Consumer", "Status", "Time"]}>
              {q.data.rows.map((e) => (
                <Fragment key={e.offset}>
                  <tr className="cursor-pointer hover:bg-surface-2" onClick={() => setOpenRow(openRow === e.offset ? null : e.offset)}>
                    <td><ChevronRight className={cn("size-4 transition-transform", openRow === e.offset && "rotate-90")} /></td>
                    <td className="font-mono text-foreground">#{e.offset}</td>
                    <td className="font-mono text-xs">{e.key}</td><td>{e.event_type}</td><td>{e.producer}</td><td>{e.consumer ?? "—"}</td>
                    <td><StatusBadge status={e.status} /></td>
                    <td className="text-xs">{new Date(e.created_at).toLocaleTimeString()}</td>
                  </tr>
                  {openRow === e.offset && (
                    <tr><td colSpan={8} className="!whitespace-normal bg-surface-2">
                      {e.error && <div className="mb-3 text-sm text-danger">{e.error}</div>}
                      <JsonView value={e.payload} />
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </Table>
            <Pager page={page} total={q.data.total} onPage={setPage} />
          </>
        )}
      </Panel>
    </>
  );
}
