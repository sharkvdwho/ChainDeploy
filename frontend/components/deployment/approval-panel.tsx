"use client";

import { useEffect, useState } from "react";

import { readMultisigSession, multisigApproveWithFreighter } from "@/lib/soroban-multisig";
import type { ApprovalRecordOut } from "@/lib/api";
import { useDeploymentStore } from "@/store/deploymentStore";
import { cn } from "@/lib/cn";

export function ApprovalPanel({
  deploymentId,
  deploymentKey,
  approvals,
}: {
  deploymentId: string;
  deploymentKey: string;
  approvals: ApprovalRecordOut[];
}) {
  const walletAddress = useDeploymentStore((s) => s.walletAddress);
  const isConnected = useDeploymentStore((s) => s.isConnected);
  const network = useDeploymentStore((s) => s.stellarNetwork);
  const pushToast = useDeploymentStore((s) => s.pushToast);
  const loadDeploymentById = useDeploymentStore((s) => s.loadDeploymentById);
  const [session, setSession] = useState<
    Awaited<ReturnType<typeof readMultisigSession>> | undefined
  >(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await readMultisigSession({
        deploymentKey,
        network,
        sorobanRpcOverride: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL,
      });
      if (!cancelled) setSession(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [deploymentKey, network]);

  const approvedSet = new Set(
    approvals.map((a) => a.approver_address),
  );
  const eligible = session?.eligible ?? [];
  const pendingList =
    eligible.length > 0
      ? eligible.filter((a) => !approvedSet.has(a))
      : [];

  async function onApprove() {
    if (!walletAddress || !isConnected) {
      pushToast({
        variant: "error",
        title: "Wallet required",
        message: "Connect Freighter on the Wallet page.",
      });
      return;
    }
    setBusy(true);
    try {
      const { txHash } = await multisigApproveWithFreighter({
        deploymentKey,
        publicKey: walletAddress,
        network,
        sorobanRpcOverride: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL,
      });
      pushToast({
        variant: "success",
        title: "Approval submitted",
        message: txHash,
      });
      await loadDeploymentById(deploymentId);
    } catch (e) {
      pushToast({
        variant: "error",
        title: "Approval failed",
        message: e instanceof Error ? e.message : "Error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-6">
      <h2 className="text-sm font-semibold text-amber-100">Multi-sig approval</h2>
      <p className="mt-1 text-xs text-amber-200/70">
        Approvers registered on the MultiSig contract must sign `approve` for
        this deployment key. Configure{" "}
        <code className="text-amber-100">NEXT_PUBLIC_MULTISIG_CONTRACT_ID</code>{" "}
        for live reads.
      </p>

      {session === undefined ? (
        <p className="mt-4 text-sm text-slate-500">Loading session…</p>
      ) : session ? (
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-slate-400">
            Quorum:{" "}
            <span className="font-mono text-slate-200">{session.required}</span>{" "}
            · Expired:{" "}
            <span className={cn(session.expired && "text-rose-400")}>
              {session.expired ? "yes" : "no"}
            </span>
          </p>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Eligible approvers
            </p>
            <ul className="mt-2 space-y-1 font-mono text-xs text-slate-300">
              {session.eligible.map((a) => (
                <li key={a} className="flex items-center gap-2">
                  <span
                    className={cn(
                      approvedSet.has(a) ? "text-emerald-400" : "text-slate-500",
                    )}
                  >
                    {approvedSet.has(a) ? "✓" : "○"}
                  </span>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          Could not read MultiSig session (contract id or RPC not configured, or
          no session on-chain).
        </p>
      )}

      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          Recorded approvals (API)
        </p>
        <ul className="mt-2 space-y-2">
          {approvals.map((a) => (
            <li key={a.id} className="font-mono text-xs text-slate-300">
              {a.approver_address}
            </li>
          ))}
          {approvals.length === 0 && (
            <li className="text-xs text-slate-600">None yet</li>
          )}
        </ul>
      </div>

      {pendingList.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Pending signatures: {pendingList.length}
        </p>
      )}

      <button
        type="button"
        onClick={() => void onApprove()}
        disabled={busy || !isConnected}
        className="mt-6 w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Signing…" : "Approve deployment (Freighter)"}
      </button>
    </div>
  );
}
