"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { StellarTxLink } from "@/components/stellar-tx-link";
import { formatTimeAgo } from "@/lib/time";
import type { Deployment } from "@/store/deploymentStore";
import type { StellarNetworkId } from "@/lib/stellar";

function DeployAvatar({ address }: { address: string }) {
  const seed = address.slice(-2) ?? "0";
  const hue = (parseInt(seed, 16) * 17) % 360;
  const initial = address.startsWith("G") ? address.slice(1, 2) : "?";
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-700 font-mono text-xs font-bold text-white"
      style={{
        background: `linear-gradient(135deg, hsl(${hue},55%,35%), hsl(${(hue + 40) % 360},50%,25%))`,
      }}
    >
      {initial}
    </div>
  );
}

export function LiveDeploymentFeed({
  deployments,
  network,
}: {
  deployments: Deployment[];
  network: StellarNetworkId;
}) {
  const sorted = [...deployments].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-200">Live deployments</h3>
        <span className="text-[10px] text-slate-500">Newest first</span>
      </div>
      <ul className="max-h-[420px] divide-y divide-slate-800/80 overflow-y-auto">
        {sorted.map((d) => (
          <li key={d.id}>
            <Link
              href={`/deployments/${d.id}`}
              className="flex items-start gap-3 px-4 py-3 transition hover:bg-slate-950/40"
            >
              <DeployAvatar address={d.deployer} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-slate-100">
                    {d.repo}
                  </span>
                  <span className="rounded-md border border-slate-800 bg-slate-950/30 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                    {d.branch}
                  </span>
                  <StatusBadge status={d.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-slate-500">
                  <span>{d.commit_sha.slice(0, 7)}</span>
                  {d.tx_hash ? (
                    <StellarTxLink hash={d.tx_hash} network={network} />
                  ) : (
                    <span className="text-slate-600">no tx</span>
                  )}
                  <span className="text-slate-600">
                    {formatTimeAgo(d.updated_at)}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
        {sorted.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-slate-500">
            No deployments yet. Push a CI run with the ChainDeploy action.
          </li>
        )}
      </ul>
    </div>
  );
}
