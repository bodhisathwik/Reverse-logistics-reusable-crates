import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { runTestSuite } from "@/lib/gateway.functions";
import type { TestResult } from "@/lib/tests.types";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/app/kit";
import { TestResults } from "@/components/app/TestResults";

export const Route = createFileRoute("/_authenticated/tests")({
  head: () => ({ meta: [{ title: "Test Runner · Crate Control Tower" }, { name: "description", content: "Domain, integration, persistence, contract and security tests." }] }),
  component: Tests,
});

function Tests() {
  const { role } = useAuth();
  const run = useServerFn(runTestSuite);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);
  async function go() {
    setBusy(true);
    try {
      const r = await run();
      setResults(r);
      const ok = r.every((x) => x.passed);
      toast[ok ? "success" : "error"](`${r.filter((x) => x.passed).length}/${r.length} tests passed`);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }
  return (
    <>
      <PageHeader title="Test Runner" subtitle="Executes live against the gateway and database: domain rule, integration, persistence constraints, event contract and security."
        actions={<Button onClick={go} disabled={busy || role !== "deliveryAgent"}>{busy ? <Loader2 className="animate-spin" /> : <FlaskConical />} Run all tests</Button>} />
      <Panel>
        <div className="p-5">
          {results ? <TestResults results={results} /> : <EmptyState title={role === "deliveryAgent" ? "Ready to run" : "Agent only"} hint={role === "deliveryAgent" ? "Click Run all tests." : "Sign in as a delivery agent to run the suite."} />}
        </div>
      </Panel>
    </>
  );
}
