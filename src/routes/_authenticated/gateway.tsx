import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useGw } from "@/lib/api";
import { EmptyState, ErrorState, PageHeader, Pager, Panel, SkeletonRows, StatusBadge, Table } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/gateway")({
  head: () => ({ meta: [{ title: "Gateway Log · Crate Control Tower" }, { name: "description", content: "Every request through the API gateway." }] }),
  component: GatewayLog,
});

type Row = { id: number; created_at: string; method: string; path: string; role: string | null; user_email: string; target_service: string | null; decision: string; status_code: number; reason: string; latency_ms: number };

function GatewayLog() {
  const [page, setPage] = useState(0);
  const q = useGw<{ rows: Row[]; total: number }>("/gateway/log", { page });
  return (
    <>
      <PageHeader title="Gateway Log" subtitle="Every call is authenticated, role-checked, routed and recorded here." />
      <Panel>
        {q.isLoading ? <SkeletonRows cols={7} /> : q.error ? <ErrorState error={q.error} /> : !q.data?.rows.length ? <EmptyState title="No requests yet" /> : (
          <>
            <Table head={["Time", "Request", "Role", "Target", "Decision", "Status", "Reason", "ms"]}>
              {q.data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-xs">{new Date(r.created_at).toLocaleTimeString()}</td>
                  <td className="font-mono text-xs text-foreground">{r.method} {r.path}</td>
                  <td>{r.role ? <StatusBadge status={r.role} /> : "—"}</td>
                  <td className="text-xs">{r.target_service ?? "—"}</td>
                  <td><StatusBadge status={r.decision} /></td>
                  <td className={r.status_code >= 400 ? "font-semibold text-danger" : "text-success"}>{r.status_code}</td>
                  <td className="max-w-xs truncate text-xs" title={r.reason}>{r.reason}</td>
                  <td className="tabular-nums text-xs">{r.latency_ms}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} total={q.data.total} onPage={setPage} />
          </>
        )}
      </Panel>
    </>
  );
}
