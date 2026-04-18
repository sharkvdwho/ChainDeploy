import type { Deployment } from "@/store/deploymentStore";

export type ChartPoint = {
  day: string;
  success: number;
  failed: number;
};

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Last 30 days buckets for line chart */
export function buildDeploymentTrend(deployments: Deployment[]): ChartPoint[] {
  const now = new Date();
  const start = startOfUtcDay(now);
  start.setUTCDate(start.getUTCDate() - 29);

  const keys: string[] = [];
  for (let i = 0; i < 30; i++) {
    const t = new Date(start);
    t.setUTCDate(start.getUTCDate() + i);
    keys.push(t.toISOString().slice(0, 10));
  }

  const map = new Map<string, { success: number; failed: number }>();
  for (const k of keys) map.set(k, { success: 0, failed: 0 });

  for (const d of deployments) {
    const day = d.created_at.slice(0, 10);
    if (!map.has(day)) continue;
    const b = map.get(day)!;
    const st = d.status.toLowerCase();
    if (st === "succeeded") b.success += 1;
    else if (
      st === "failed" ||
      st === "rejected" ||
      st === "rolled_back" ||
      st === "pending_approval"
    ) {
      b.failed += 1;
    }
  }

  return keys.map((day) => {
    const b = map.get(day)!;
    return {
      day: day.slice(5),
      success: b.success,
      failed: b.failed,
    };
  });
}

export function countTodaysDeployments(deployments: Deployment[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return deployments.filter((d) => d.created_at.startsWith(today)).length;
}

export function successRatePercent(deployments: Deployment[]): number {
  const terminal = deployments.filter((d) => {
    const s = d.status.toLowerCase();
    return s === "succeeded" || s === "failed" || s === "rejected" || s === "rolled_back";
  });
  if (!terminal.length) return 100;
  const ok = terminal.filter((d) => d.status.toLowerCase() === "succeeded").length;
  return Math.round((ok / terminal.length) * 1000) / 10;
}

export function averageDeploySeconds(deployments: Deployment[]): number | null {
  const done = deployments.filter((d) => {
    const s = d.status.toLowerCase();
    return (
      (s === "succeeded" || s === "failed" || s === "rejected" || s === "rolled_back") &&
      d.updated_at &&
      d.created_at
    );
  });
  if (!done.length) return null;
  let sum = 0;
  for (const d of done) {
    const a = new Date(d.created_at).getTime();
    const b = new Date(d.updated_at).getTime();
    sum += Math.max(0, (b - a) / 1000);
  }
  return Math.round((sum / done.length) * 10) / 10;
}

/** Rollbacks visible at list granularity (status only — detail shows AUTO/MANUAL). */
export function countRollbacks(deployments: Deployment[]): number {
  return deployments.filter((d) => d.status.toLowerCase() === "rolled_back").length;
}
