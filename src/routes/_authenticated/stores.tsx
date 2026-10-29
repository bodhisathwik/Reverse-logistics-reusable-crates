import { createFileRoute } from "@tanstack/react-router";
import { useGw } from "@/lib/api";
import { ErrorState, PageHeader, Panel, SkeletonRows } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/stores")({
  head: () => ({ meta: [{ title: "Data Stores · Crate Control Tower" }, { name: "description", content: "Each service's separate persistence." }] }),
  component: Stores,
});

type Stores = Record<string, Record<string, Record<string, unknown>[] | null>>;

function Stores() {
  const q = useGw<Stores>("/stores");
  return (
    <>
      <PageHeader title="Data Stores" subtitle="Each service owns its own tables. No service reads another's — they talk via REST through the gateway or via events." />
      {q.isLoading ? <SkeletonRows cols={3} /> : q.error ? <ErrorState error={q.error} /> : (
        <div className="grid gap-4 xl:grid-cols-3">
          {Object.entries(q.data!).map(([svc, tables]) => (
            <Panel key={svc} title={<span className="font-mono text-primary">{svc}</span>}>
              <div className="space-y-5 p-4">
                {Object.entries(tables).map(([t, rows]) => (
                  <div key={t}>
                    <div className="mb-2 font-mono text-xs text-foreground">{t}</div>
                    <div className="surface-panel overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead><tr className="border-b">{Object.keys(rows?.[0] ?? {}).map((k) => <th key={k} className="px-2 py-1.5 text-left font-medium">{k}</th>)}</tr></thead>
                        <tbody>
                          {(rows ?? []).map((r, i) => (
                            <tr key={i} className="border-b last:border-0">{Object.values(r).map((v, j) => <td key={j} className="whitespace-nowrap px-2 py-1.5 font-mono">{String(v ?? "—")}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
