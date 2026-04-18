import type { DeploymentDetailResponse } from "@/lib/api";

export type TimelineEvent = {
  id: string;
  at: string;
  label: string;
  detail?: string;
  txHash?: string | null;
};

export function buildTimeline(d: DeploymentDetailResponse): TimelineEvent[] {
  const dep = d.deployment;
  const out: TimelineEvent[] = [
    {
      id: "created",
      at: dep.created_at,
      label: "Deployment record created",
      detail: `${dep.repo}@${dep.branch}`,
    },
  ];

  if (dep.tx_hash) {
    out.push({
      id: "evaluate",
      at: dep.created_at,
      label: "Scorecard evaluated on-chain",
      txHash: dep.tx_hash,
      detail: `Ledger ${dep.stellar_ledger ?? "—"}`,
    });
  }

  for (const a of d.approvals) {
    out.push({
      id: `appr-${a.id}`,
      at: a.approved_at,
      label: "Approver signed",
      detail: a.approver_address,
      txHash: a.tx_hash,
    });
  }

  for (const r of d.rollbacks) {
    out.push({
      id: `rb-${r.id}`,
      at: r.rolled_back_at,
      label: `Rollback (${r.trigger_type})`,
      txHash: r.tx_hash,
    });
  }

  for (let i = 0; i < d.on_chain_events.length; i++) {
    const ev = d.on_chain_events[i] as Record<string, unknown>;
    out.push({
      id: `chain-${i}`,
      at: dep.updated_at,
      label: "Soroban event (sample)",
      detail: JSON.stringify(ev).slice(0, 200),
    });
  }

  out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return out;
}
