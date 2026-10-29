import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import type { TestResult } from "@/lib/tests.types";
import { cn } from "@/lib/utils";

export function TestResults({ results }: { results: TestResult[] }) {
  const passed = results.filter((r) => r.passed).length;
  return (
    <div>
      <div className={cn("mb-4 text-sm font-semibold", passed === results.length ? "text-success" : "text-danger")}>
        {passed}/{results.length} passed
      </div>
      <ul className="space-y-2">
        {results.map((r, i) => (
          <motion.li key={r.group + r.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 7) * 0.05 }}
            className="surface-panel flex items-start gap-3 p-3">
            <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", r.passed ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
              {r.passed ? <Check className="size-3" /> : <X className="size-3" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">{r.group}</span>
                <span className="font-medium text-foreground">{r.name}</span>
              </div>
              <div className="mt-1 text-xs">{r.assertion}</div>
              {r.detail && <div className="mt-1 text-xs text-danger">{r.detail}</div>}
            </div>
            <span className="text-xs tabular-nums">{r.ms}ms</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
