"use client";

import { useEffect, useState } from "react";

import {
  freighterConnect,
  freighterNetwork,
  mapPassphraseToNetworkId,
  signApproverRegistrationMemo,
} from "@/lib/freighter-wallet";
import { readTeamApprovers } from "@/lib/soroban-multisig";
import { useDeploymentStore } from "@/store/deploymentStore";
import { getHorizonServer } from "@/lib/stellar";
import { StellarTxLink } from "@/components/stellar-tx-link";
import { apiNetworkToId } from "@/lib/stellar-expert";
import {
  detectFreighterInstalled,
  FREIGHTER_INSTALL_URL,
} from "@/lib/freighter-detect";

export default function ConnectPage() {
  const walletAddress = useDeploymentStore((s) => s.walletAddress);
  const isConnected = useDeploymentStore((s) => s.isConnected);
  const stellarNetwork = useDeploymentStore((s) => s.stellarNetwork);
  const xlmBalance = useDeploymentStore((s) => s.xlmBalance);
  const connectWallet = useDeploymentStore((s) => s.connectWallet);
  const setBalance = useDeploymentStore((s) => s.setWalletBalance);
  const pushToast = useDeploymentStore((s) => s.pushToast);

  const [team, setTeam] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [regTx, setRegTx] = useState<string | null>(null);
  const [freighterOk, setFreighterOk] = useState<boolean | null>(null);

  useEffect(() => {
    void detectFreighterInstalled().then(setFreighterOk);
  }, []);

  const netLabel = apiNetworkToId(stellarNetwork);

  useEffect(() => {
    if (!walletAddress || !isConnected) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const server = getHorizonServer(stellarNetwork);
        const acc = await server.loadAccount(walletAddress);
        const native = acc.balances.find((b) => b.asset_type === "native");
        const amt = native ? native.balance : "0";
        if (!cancelled) setBalance(amt);
      } catch {
        if (!cancelled) setBalance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, isConnected, stellarNetwork, setBalance]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await readTeamApprovers({
        network: stellarNetwork,
        sorobanRpcOverride: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL,
      });
      if (!cancelled) setTeam(t);
    })();
    return () => {
      cancelled = true;
    };
  }, [stellarNetwork]);

  async function onConnect() {
    setBusy(true);
    try {
      const { address } = await freighterConnect();
      const { passphrase } = await freighterNetwork();
      const net = mapPassphraseToNetworkId(passphrase);
      connectWallet(address, net);
      pushToast({ variant: "success", title: "Wallet connected", message: address });
    } catch (e) {
      pushToast({
        variant: "error",
        title: "Connection failed",
        message: e instanceof Error ? e.message : "Error",
      });
    } finally {
      setBusy(false);
    }
  }

  function onDisconnect() {
    connectWallet(null, stellarNetwork);
    setRegTx(null);
    pushToast({ variant: "info", title: "Wallet cleared" });
  }

  async function onRegister() {
    if (!walletAddress) return;
    setBusy(true);
    try {
      const { txHash } = await signApproverRegistrationMemo({
        network: stellarNetwork,
        publicKey: walletAddress,
      });
      setRegTx(txHash);
      pushToast({
        variant: "success",
        title: "Registration proof submitted",
        message: txHash,
      });
    } catch (e) {
      pushToast({
        variant: "error",
        title: "Signing failed",
        message: e instanceof Error ? e.message : "Error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {freighterOk === false && (
        <div
          className="panel relative overflow-hidden border-amber-500/40 bg-amber-950/20 px-4 py-3 text-sm leading-relaxed text-amber-100"
          role="status"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(720px circle at 12% 0%, rgba(251,191,36,0.16), transparent 55%), radial-gradient(720px circle at 70% 110%, rgba(245,158,11,0.10), transparent 55%)",
            }}
          />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/80">
                Wallet extension required
              </p>
              <p className="mt-1 font-semibold">Freighter not detected</p>
              <p className="mt-1 text-amber-200/90">
                Install Freighter to sign Stellar transactions from this dashboard.
              </p>
            </div>
            <a
              href={FREIGHTER_INSTALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-full border border-amber-500/40 bg-amber-950/30 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-950/45"
            >
              Install Freighter
            </a>
          </div>
        </div>
      )}

      <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/35 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(900px circle at 15% 10%, rgba(56,189,248,0.22), transparent 55%), radial-gradient(820px circle at 72% 22%, rgba(168,85,247,0.18), transparent 54%), radial-gradient(780px circle at 50% 115%, rgba(16,185,129,0.10), transparent 58%)",
            }}
          />
          <div
            className="absolute inset-0 opacity-35"
            style={{
              backgroundImage:
                "linear-gradient(rgba(148,163,184,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage:
                "radial-gradient(640px circle at 30% 25%, black 30%, transparent 72%)",
              WebkitMaskImage:
                "radial-gradient(640px circle at 30% 25%, black 30%, transparent 72%)",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950/45" />
        </div>

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Wallet
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/40 px-3 py-1 text-[11px] font-medium text-slate-400">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isConnected ? "bg-emerald-400/80" : "bg-slate-500"
                  }`}
                />
                {isConnected ? "Connected" : "Not connected"}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/40 px-3 py-1 text-[11px] font-medium text-slate-400">
                Network{" "}
                <span className="font-mono text-slate-200">{netLabel}</span>
              </span>
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Sign approvals with Freighter
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300/90">
              Connect your wallet to approve deployments and generate a verifiable intent
              proof. Team membership is managed on-chain by the contract admin (
              <code className="text-slate-200">set_team_approvers</code>).
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            {!isConnected ? (
              <button
                type="button"
                onClick={() => void onConnect()}
                disabled={busy}
                className="btn-primary w-full disabled:opacity-60 sm:w-auto"
                aria-busy={busy ? "true" : "false"}
              >
                {busy ? "Opening Freighter…" : "Connect Freighter"}
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onDisconnect}
                  className="btn-ghost w-full sm:w-auto"
                >
                  Disconnect
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRegister()}
                  className="btn-primary w-full disabled:opacity-60 sm:w-auto"
                  aria-busy={busy ? "true" : "false"}
                  title="Sign a small registration memo transaction"
                >
                  {busy ? "Signing…" : "Sign intent proof"}
                </button>
              </div>
            )}
            {isConnected && (
              <div className="text-[11px] text-slate-400 sm:text-right">
                Balance{" "}
                <span className="font-mono text-stellar-200">
                  {xlmBalance ?? "…"} XLM
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <section className="lg:col-span-12">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="panel relative overflow-hidden p-4">
              <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(520px_circle_at_20%_0%,rgba(255,255,255,0.06),transparent_55%)]" />
              <p className="relative text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Status
              </p>
              <p className="relative mt-2 font-mono text-2xl font-semibold tracking-tight text-white">
                {isConnected ? "Connected" : "Offline"}
              </p>
              <p className="relative mt-1 text-xs text-slate-500">
                {isConnected ? "Ready to sign proofs" : "Connect Freighter to continue"}
              </p>
            </div>
            <div className="panel relative overflow-hidden p-4">
              <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(520px_circle_at_20%_0%,rgba(255,255,255,0.06),transparent_55%)]" />
              <p className="relative text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Network
              </p>
              <p className="relative mt-2 font-mono text-2xl font-semibold tracking-tight text-white">
                {netLabel}
              </p>
              <p className="relative mt-1 text-xs text-slate-500">
                Wallet network from Freighter
              </p>
            </div>
            <div className="panel relative overflow-hidden p-4">
              <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(520px_circle_at_20%_0%,rgba(255,255,255,0.06),transparent_55%)]" />
              <p className="relative text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Balance
              </p>
              <p className="relative mt-2 font-mono text-2xl font-semibold tracking-tight text-white">
                {isConnected ? `${xlmBalance ?? "…"} XLM` : "—"}
              </p>
              <p className="relative mt-1 text-xs text-slate-500">
                Native asset on Horizon
              </p>
            </div>
            <div className="panel relative overflow-hidden p-4">
              <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(520px_circle_at_20%_0%,rgba(255,255,255,0.06),transparent_55%)]" />
              <p className="relative text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Team approvers
              </p>
              <p className="relative mt-2 font-mono text-2xl font-semibold tracking-tight text-white">
                {team === null ? "—" : String(team.length)}
              </p>
              <p className="relative mt-1 text-xs text-slate-500">
                Loaded from the contract
              </p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-5">
          <div className="panel overflow-hidden">
            <div className="panel-header">
              <h2 className="text-sm font-semibold text-slate-200">Connected wallet</h2>
              <p className="mt-1 text-xs text-slate-500">
                This address is used to sign approvals and intent proofs.
              </p>
            </div>

            <div className="p-6">
              {isConnected && walletAddress ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Address
                    </p>
                    <p className="mt-2 break-all rounded-2xl border border-slate-800 bg-slate-950/40 p-3 font-mono text-sm text-slate-200">
                      {walletAddress}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span className="rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1 font-mono text-xs text-slate-200">
                      {netLabel}
                    </span>
                    <span className="rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1 font-mono text-xs text-stellar-300">
                      {xlmBalance ?? "…"} XLM
                    </span>
                  </div>
                  {regTx && (
                    <div className="pt-1">
                      <StellarTxLink hash={regTx} network={stellarNetwork} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
                  Connect Freighter to see your wallet address and balance.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="lg:col-span-7">
          <div className="panel overflow-hidden">
            <div className="panel-header">
              <h2 className="text-sm font-semibold text-slate-200">
                Team approvers (read-only)
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Loaded from <code className="text-slate-400">get_team_approvers</code>{" "}
                when{" "}
                <code className="text-slate-400">
                  NEXT_PUBLIC_DEPLOYMENT_DECISION_CONTRACT_ID
                </code>{" "}
                is set.
              </p>
            </div>
            <div className="p-6">
              {team && team.length > 0 ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {team.map((a) => (
                    <li
                      key={a}
                      className="rounded-2xl border border-slate-800 bg-slate-950/40 px-3 py-2 font-mono text-xs text-slate-300"
                    >
                      {a}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
                  {team === null
                    ? "Could not load (missing contract id or RPC)."
                    : "No approvers configured yet."}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 panel overflow-hidden">
            <div className="panel-header">
              <h2 className="text-sm font-semibold text-slate-200">
                Register approver intent
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Signs a tiny self-payment with memo{" "}
                <code className="text-slate-400">CHAINAPPROVER</code> so you can share
                the transaction hash with an admin off-chain. This does not modify the
                on-chain team list.
              </p>
            </div>
            <div className="p-6">
              <button
                type="button"
                disabled={!isConnected || busy}
                onClick={() => void onRegister()}
                className="btn-primary w-full disabled:opacity-60"
                aria-busy={busy ? "true" : "false"}
              >
                {busy ? "Signing…" : "Sign registration memo"}
              </button>
              {regTx && (
                <div className="mt-4">
                  <StellarTxLink hash={regTx} network={stellarNetwork} />
                </div>
              )}
              {!isConnected && (
                <div className="mt-3 text-xs text-slate-500">
                  Connect your wallet first to sign an intent proof.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
