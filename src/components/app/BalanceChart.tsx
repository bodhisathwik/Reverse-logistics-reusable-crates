import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function BalanceChart({ data }: { data: { depot_name: string; issued: number; returned: number; outstanding: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ left: -16, right: 8, top: 10 }}>
        <defs>
          <linearGradient id="gRet" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--success)" stopOpacity={0.45} /><stop offset="100%" stopColor="var(--success)" stopOpacity={0} /></linearGradient>
          <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--warning)" stopOpacity={0.45} /><stop offset="100%" stopColor="var(--warning)" stopOpacity={0} /></linearGradient>
          <linearGradient id="gIss" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--info)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--info)" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="depot_name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)" }} />
        <Area type="monotone" dataKey="issued" stroke="var(--info)" fill="url(#gIss)" strokeWidth={2} />
        <Area type="monotone" dataKey="returned" stroke="var(--success)" fill="url(#gRet)" strokeWidth={2} />
        <Area type="monotone" dataKey="outstanding" stroke="var(--warning)" fill="url(#gOut)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
