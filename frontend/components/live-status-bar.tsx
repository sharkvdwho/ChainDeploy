"use client";

import { useEffect } from "react";

import { getHorizonServer, type StellarNetworkId } from "@/lib/stellar";
import { apiNetworkToId } from "@/lib/stellar-expert";
import { useDeploymentStore } from "@/store/deploymentStore";
import { cn } from "@/lib/cn";
import { useHealthQuery } from "@/lib/queries";

async function loadBalanceWithRetry(
  network: StellarNetworkId,
  publicKey: string,
  maxAttempts = 3,
): Promise<string | null> {
  let delay = 800;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const server = getHorizonServer(network);
      const acc = await server.loadAccount(publicKey);
      const native = acc.balances.find((b) => b.asset_type === "native");
      return native ? native.balance : "0";
    } catch {
      if (attempt === maxAttempts - 1) return null;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 8000);
    }
  }
  return null;
}

export function LiveStatusBar() {
  const walletAddress = useDeploymentStore((s) => s.walletAddress);
  const isConnected = useDeploymentStore((s) => s.isConnected);
  const stellarNetwork = useDeploymentStore((s) => s.stellarNetwork);
  const setBalance = useDeploymentStore((s) => s.setWalletBalance);
  const setApiNet = useDeploymentStore((s) => s.setApiStellarNetwork);
  const xlmBalance = useDeploymentStore((s) => s.xlmBalance);

  const { data: health, isError, isLoading, refetch, isFetching } =
    useHealthQuery();

  useEffect(() => {
    if (health?.stellar_network) {
      setApiNet(health.stellar_network);
    }
  }, [health, setApiNet]);

  useEffect(() => {
    if (!walletAddress || !isConnected) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const amt = await loadBalanceWithRetry(stellarNetwork, walletAddress);
      if (!cancelled) setBalance(amt);
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, isConnected, stellarNetwork, setBalance]);

  const apiOk = isError ? false : health ? true : isLoading || isFetching ? null : false;
  const apiLabel = isError
    ? "unreachable"
    : (health?.stellar_network ?? (isLoading ? "…" : "…"));
  const apiNet = apiNetworkToId(health?.stellar_network ?? "testnet");

  return (
    <div className="panel flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            apiOk === true && "bg-emerald-400 shadow shadow-emerald-500/50",
            apiOk === false && "bg-rose-400",
            apiOk === null && "bg-slate-500",
          )}
        />
        <span className="text-xs font-medium text-slate-400">Stellar RPC</span>
        <span className="font-mono text-xs text-slate-200">{apiLabel}</span>
        <span
          className={cn(
            "rounded-full border bg-slate-950/30 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
            apiNet === "mainnet"
              ? "border-emerald-500/30 text-emerald-300"
              : "border-sky-500/30 text-sky-300",
          )}
        >
          {apiNet}
        </span>
        {isError && (
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-[10px] font-semibold text-stellar-400 underline decoration-white/10 underline-offset-4 hover:text-stellar-300"
          >
            Retry health
          </button>
        )}
      </div>

      <div className="h-4 w-px bg-slate-800" />

      <div className="flex min-w-[200px] flex-1 flex-wrap items-center gap-3 text-xs">
        {isConnected && walletAddress ? (
          <>
            <div>
              <span className="text-slate-500">Wallet </span>
              <span className="font-mono text-slate-200">
                {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Balance </span>
              <span className="font-mono text-stellar-300">
                {xlmBalance ?? "…"} XLM
              </span>
            </div>
          </>
        ) : (
          <span className="text-slate-500">
            Connect a wallet on the{" "}
            <a href="/connect" className="text-stellar-400 hover:underline">
              Wallet
            </a>{" "}
            page to see balance.
          </span>
        )}
      </div>
    </div>
  );
}
