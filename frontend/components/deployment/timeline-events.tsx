import { StellarTxLink } from "@/components/stellar-tx-link";
import type { TimelineEvent } from "@/lib/timeline";
import type { StellarNetworkId } from "@/lib/stellar";
import { formatIso } from "@/lib/time";

export function TimelineEvents({
  events,
  network,
}: {
  events: TimelineEvent[];
  network: StellarNetworkId;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-sm font-semibold text-slate-200">Timeline</h2>
      <p className="mt-1 text-xs text-slate-500">
        Deployment lifecycle, approvals, rollbacks, and sampled Soroban events.
      </p>
      <ol className="relative mt-6 border-l border-slate-800 pl-6">
        {events.map((e) => (
          <li key={e.id} className="mb-6 last:mb-0">
            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-stellar-500" />
            <p className="text-sm font-medium text-slate-100">{e.label}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{formatIso(e.at)}</p>
            {e.detail && (
              <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
                {e.detail}
              </p>
            )}
            {e.txHash && (
              <div className="mt-2">
                <StellarTxLink hash={e.txHash} network={network} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
