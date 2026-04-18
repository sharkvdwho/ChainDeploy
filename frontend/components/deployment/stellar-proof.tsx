"use client";

import { StellarTxLink } from "@/components/stellar-tx-link";
import type { StellarNetworkId } from "@/lib/stellar";
import { stellarExpertTxUrl } from "@/lib/stellar-expert";
import { formatIso } from "@/lib/time";

export function StellarProof({
  txHash,
  ledger,
  createdAt,
  raw,
  network,
}: {
  txHash: string | null;
  ledger: number | null;
  createdAt: string;
  raw: Record<string, unknown> | null;
  network: StellarNetworkId;
}) {
  const explorer = txHash ? stellarExpertTxUrl(network, txHash) : null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-sm font-semibold text-slate-200">Stellar proof</h2>
      <p className="mt-1 text-xs text-slate-500">
        On-chain invocation of DeploymentDecision (evaluate) for this deployment.
      </p>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">
            Transaction
          </dt>
          <dd className="mt-1">
            {txHash ? (
              <StellarTxLink hash={txHash} network={network} />
            ) : (
              <span className="text-slate-500">Not submitted</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">
            Ledger
          </dt>
          <dd className="font-mono text-slate-200">{ledger ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">
            Timestamp
          </dt>
          <dd className="text-slate-200">{formatIso(createdAt)}</dd>
        </div>
      </dl>

      {explorer && (
        <a
          href={explorer}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex rounded-lg bg-stellar-600 px-4 py-2 text-sm font-semibold text-white hover:bg-stellar-500"
        >
          Verify on Stellar Expert
        </a>
      )}

      <pre className="mt-4 max-h-56 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[10px] leading-relaxed text-slate-400">
        {raw && Object.keys(raw).length
          ? JSON.stringify(raw, null, 2)
          : "{ }"}
      </pre>
    </div>
  );
}
