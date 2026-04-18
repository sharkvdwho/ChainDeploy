"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ChartPoint } from "@/lib/metrics";

export function DeploymentChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/30 p-4 shadow-xl shadow-black/20">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(520px circle at 18% 20%, rgba(51,150,255,0.14), transparent 55%), radial-gradient(620px circle at 70% 10%, rgba(16,185,129,0.10), transparent 52%)",
        }}
      />

      <div className="relative mb-4 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">
            Deployment outcomes
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            30-day trend of terminal deployments (success vs failure/rollback)
          </p>
        </div>
        <span className="hidden rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1 font-mono text-[10px] text-slate-400 sm:inline">
          UTC daily buckets
        </span>
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="day" stroke="#94a3b8" fontSize={10} tickLine={false} />
          <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          <Line
            type="monotone"
            dataKey="success"
            name="Success"
            stroke="#34d399"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="failed"
            name="Failure / rollback"
            stroke="#f87171"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** @deprecated Use {@link DeploymentChart} */
export function DeploymentRolloutChart({
  data,
}: {
  data: { t: string; success: number; failed: number }[];
}) {
  const mapped = data.map((d) => ({
    day: d.t,
    success: d.success,
    failed: d.failed,
  }));
  return <DeploymentChart data={mapped} />;
}
