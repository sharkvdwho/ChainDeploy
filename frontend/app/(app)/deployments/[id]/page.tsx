"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { DeploymentHeader } from "@/components/deployment/deployment-header";
import { ScorecardPanel } from "@/components/deployment/scorecard-panel";
import { StellarProof } from "@/components/deployment/stellar-proof";
import { ApprovalPanel } from "@/components/deployment/approval-panel";
import { RollbackPanel } from "@/components/deployment/rollback-panel";
import { TimelineEvents } from "@/components/deployment/timeline-events";
import { DeploymentDetailSkeleton } from "@/components/skeletons";
import { buildTimeline } from "@/lib/timeline";
import { useDeploymentDetailQuery } from "@/lib/queries";
import { useDeploymentStore } from "@/store/deploymentStore";
import { apiNetworkToId } from "@/lib/stellar-expert";

export default function DeploymentDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const setActive = useDeploymentStore((s) => s.setActiveDeployment);
  const walletNet = useDeploymentStore((s) => s.stellarNetwork);
  const apiNet = useDeploymentStore((s) => s.apiStellarNetwork);

  const { data, isLoading, isError, error, refetch } =
    useDeploymentDetailQuery(id);

  useEffect(() => {
    if (data?.deployment) {
      setActive(data.deployment);
    }
  }, [data, setActive]);

  const net = apiNetworkToId(apiNet ?? walletNet);

  if (isLoading || (!data && !isError)) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/deployments"
          className="text-sm text-slate-500 hover:text-stellar-400"
        >
          ← Deployments
        </Link>
        <DeploymentDetailSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-10 text-center">
        <p className="text-slate-400">
          {error instanceof Error ? error.message : "Deployment not found"}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-4 text-sm text-stellar-400 hover:underline"
        >
          Retry
        </button>
        <Link
          href="/deployments"
          className="mt-4 block text-sm text-slate-500 hover:text-stellar-400"
        >
          ← Back to deployments
        </Link>
      </div>
    );
  }

  const dep = data.deployment;
  const score = dep.scorecard_json as Record<string, unknown> | null;
  const status = dep.status.toLowerCase();

  const rawProof = {
    scorecard: dep.scorecard_json,
    stellar_sample: dep.stellar_transactions_sample,
  };

  const timeline = buildTimeline(data);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/deployments"
        className="text-sm text-slate-500 hover:text-stellar-400"
      >
        ← Deployments
      </Link>

      <DeploymentHeader dep={dep} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ScorecardPanel scorecard={score} />
        <StellarProof
          txHash={dep.tx_hash}
          ledger={dep.stellar_ledger}
          createdAt={dep.created_at}
          raw={rawProof}
          network={net}
        />
      </div>

      {status === "pending_approval" && (
        <ApprovalPanel
          deploymentId={id}
          deploymentKey={dep.deployment_key}
          approvals={data.approvals}
        />
      )}

      {status === "rolled_back" && (
        <RollbackPanel
          rollbacks={data.rollbacks}
          deploymentCreatedAt={dep.created_at}
          network={net}
        />
      )}

      <TimelineEvents events={timeline} network={net} />
    </div>
  );
}
