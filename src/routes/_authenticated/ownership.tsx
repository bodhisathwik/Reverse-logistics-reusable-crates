import { createFileRoute } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { ENDPOINTS } from "@/lib/domain";
import { PageHeader, Panel, Table } from "@/components/app/kit";

export const Route = createFileRoute("/_authenticated/ownership")({
  head: () => ({ meta: [{ title: "Ownership Matrix · Crate Control Tower" }, { name: "description", content: "Data ownership, events and endpoint permissions." }] }),
  component: Ownership,
});

const OWN = [
  { svc: "crate-asset-service", tables: "crate_asset_types, crate_asset_crates", produces: "—", consumes: "—" },
  { svc: "custody-service", tables: "custody_depots, custody_agents, custody_records, custody_return_scans", produces: "CustodyIssued, CrateReturned", consumes: "—" },
  { svc: "return-balance-service", tables: "balance_custody, balance_depot, balance_ledger", produces: "—", consumes: "CustodyIssued, CrateReturned" },
  { svc: "api-gateway", tables: "gateway_log", produces: "—", consumes: "—" },
  { svc: "service-registry", tables: "service_registry", produces: "—", consumes: "—" },
  { svc: "event-bus", tables: "event_bus (topic soa.s06.t06.events)", produces: "—", consumes: "—" },
];
const yes = <Check className="size-4 text-success" />;
const no = <X className="size-4 text-danger" />;

function Ownership() {
  return (
    <>
      <PageHeader title="Ownership Matrix" subtitle="Who owns which data, who produces and consumes which event, and which role may call which endpoint." />
      <Panel title="Data & events">
        <Table head={["Service", "Owns tables", "Produces", "Consumes"]}>
          {OWN.map((o) => (
            <tr key={o.svc}><td className="font-mono text-xs text-foreground">{o.svc}</td><td className="!whitespace-normal text-xs">{o.tables}</td><td className="text-warning">{o.produces}</td><td className="text-success">{o.consumes}</td></tr>
          ))}
        </Table>
      </Panel>
      <Panel title="Endpoint permissions (enforced at gateway + RLS)" className="mt-6">
        <Table head={["Endpoint", "Service", "deliveryAgent", "customerDepot", "Purpose"]}>
          {ENDPOINTS.map((e) => (
            <tr key={e.method + e.path}>
              <td className="font-mono text-xs text-foreground">{e.method} {e.path}</td><td className="text-xs">{e.service}</td>
              <td>{e.roles.includes("deliveryAgent") ? yes : no}</td><td>{e.roles.includes("customerDepot") ? yes : no}</td>
              <td className="text-xs">{e.description}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
