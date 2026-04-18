"use client";

import {
  countRollbacks,
  countTodaysDeployments,
  successRatePercent,
  averageDeploySeconds,
} from "@/lib/metrics";
import type { Deployment } from "@/store/deploymentStore";
import { cn } from "@/lib/cn";

function Card({
  title,
  value,
  hint,
  accent,
}: {
  title: string;
  value: string;
  hint?: string;
  accent: "emerald" | "sky" | "violet" | "amber";
}) {
  const border =
    accent === "emerald"
      ? "border-l-emerald-500/80"
      : accent === "sky"
        ? "border-l-sky-500/80"
        : accent === "violet"
          ? "border-l-violet-500/80"
          : "border-l-amber-500/80";

  const glow =
    accent === "emerald"
      ? "shadow-emerald-500/10"
      : accent === "sky"
        ? "shadow-sky-500/10"
        : accent === "violet"
          ? "shadow-violet-500/10"
          : "shadow-amber-500/10";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-800/80 border-l-4 bg-slate-900/30 p-4 shadow-xl backdrop-blur",
        border,
        glow,
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(520px_circle_at_20%_0%,rgba(255,255,255,0.06),transparent_55%)]" />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-white">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function MetricCards({ deployments }: { deployments: Deployment[] }) {
  const today = countTodaysDeployments(deployments);
  const rate = successRatePercent(deployments);
  const avg = averageDeploySeconds(deployments);
  const roll = countRollbacks(deployments);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        title="Today's deployments"
        value={String(today)}
        accent="sky"
        hint="Created since 00:00 UTC"
      />
      <Card
        title="Success rate"
        value={`${rate}%`}
        accent="emerald"
        hint="Terminal deployments (30d window in chart)"
      />
      <Card
        title="Avg deploy time"
        value={avg === null ? "—" : `${avg}s`}
        accent="amber"
        hint="created → updated"
      />
      <Card
        title="Rollbacks"
        value={String(roll)}
        accent="violet"
        hint="Deployments with rolled_back status"
      />
    </div>
  );
}
