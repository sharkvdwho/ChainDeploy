import { StellarTxLink } from "@/components/stellar-tx-link";
import type { RollbackRecordOut } from "@/lib/api";
import type { StellarNetworkId } from "@/lib/stellar";
import { formatIso } from "@/lib/time";

export function RollbackPanel({
  rollbacks,
  deploymentCreatedAt,
  network,
}: {
  rollbacks: RollbackRecordOut[];
  deploymentCreatedAt: string;
  network: StellarNetworkId;
}) {
  const r = rollbacks[0];
  if (!r) return null;

  const t0 = new Date(deploymentCreatedAt).getTime();
  const t1 = new Date(r.rolled_back_at).getTime();
  const secs = Math.max(0, Math.round((t1 - t0) / 1000));

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-950/25 p-6">
      <h2 className="text-sm font-semibold text-violet-100">Rollback</h2>
      <p className="mt-1 text-xs text-violet-200/70">
        RollbackEngine processed a rollback for this deployment.
      </p>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">
            Trigger
          </dt>
          <dd className="font-mono text-slate-100">{r.trigger_type}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">
            Time to rollback
          </dt>
          <dd className="font-mono text-slate-200">{secs}s since deployment row</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">
            Rolled back at
          </dt>
          <dd className="text-slate-200">{formatIso(r.rolled_back_at)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">
            Transaction
          </dt>
          <dd className="mt-1">
            {r.tx_hash ? (
              <StellarTxLink hash={r.tx_hash} network={network} />
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          Metrics payload
        </p>
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[10px] text-slate-400">
          {r.metrics_json
            ? JSON.stringify(r.metrics_json, null, 2)
            : "{}"}
        </pre>
      </div>
    </div>
  );
}
