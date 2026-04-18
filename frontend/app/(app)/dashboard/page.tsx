"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

import { LiveStatusBar } from "@/components/live-status-bar";
import { MetricCards } from "@/components/metric-cards";
import { LiveDeploymentFeed } from "@/components/live-deployment-feed";
import { DeploymentsTable } from "@/components/dashboard/deployments-table";
import {
  ChartSkeleton,
  DashboardHeroSkeleton,
  FeedSkeleton,
  MetricCardsSkeleton,
} from "@/components/skeletons";
import { useDeploymentStore } from "@/store/deploymentStore";
import { buildDeploymentTrend } from "@/lib/metrics";
import { useDeploymentsHistoryQuery, useHealthQuery } from "@/lib/queries";
import { useDeploymentSocket } from "@/hooks/use-deployment-socket";
import { useLiveDeploymentsWs } from "@/hooks/use-live-ws";
import { apiNetworkToId } from "@/lib/stellar-expert";

const DeploymentChart = dynamic(
  () =>
    import("@/components/deployment-chart").then((m) => m.DeploymentChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  },
);

export default function DashboardPage() {
  const setApiNet = useDeploymentStore((s) => s.setApiStellarNetwork);
  const walletNet = useDeploymentStore((s) => s.stellarNetwork);

  const { data: health, isFetching: isHealthFetching } = useHealthQuery();
  const {
    data: history,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    dataUpdatedAt,
  } = useDeploymentsHistoryQuery(200);

  useDeploymentSocket(true);
  useLiveDeploymentsWs(true);

  useEffect(() => {
    if (health?.stellar_network) {
      setApiNet(health.stellar_network);
    }
  }, [health, setApiNet]);

  const deployments = history?.items ?? [];
  const chartData = buildDeploymentTrend(deployments);
  const apiNet = useDeploymentStore((s) => s.apiStellarNetwork);
  const net = apiNetworkToId(apiNet ?? health?.stellar_network ?? walletNet);

  const errMsg = isError
    ? error instanceof Error
      ? error.message
      : "Failed to load deployments"
    : null;

  const lastUpdated =
    dataUpdatedAt > 0 ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  return (
    <div className="flex flex-col gap-8">
      {isLoading && !history ? (
        <DashboardHeroSkeleton />
      ) : (
        <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900/40 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(900px circle at 15% 10%, rgba(56,189,248,0.22), transparent 55%), radial-gradient(820px circle at 72% 22%, rgba(168,85,247,0.18), transparent 54%), radial-gradient(780px circle at 50% 115%, rgba(16,185,129,0.10), transparent 58%)",
              }}
            />
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(148,163,184,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
                maskImage:
                  "radial-gradient(600px circle at 28% 35%, black 30%, transparent 70%)",
                WebkitMaskImage:
                  "radial-gradient(600px circle at 28% 35%, black 30%, transparent 70%)",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950/45" />
          </div>

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_0_4px_rgba(16,185,129,0.10)]" />
                  Mission control
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/40 px-3 py-1 text-[11px] font-medium text-slate-400">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isHealthFetching ? "bg-amber-400/80" : "bg-sky-400/80"
                    }`}
                  />
                  Health {isHealthFetching ? "checking…" : "cached"}
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Deploy with confidence
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300/90">
                Real-time decisions, approvals, rollbacks, and on-chain proof — tuned
                for operators.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/35 px-3 py-1 font-mono">
                  <span className="text-slate-400">API</span>
                  <span className="text-slate-200">
                    {health?.service ?? "ChainDeploy"}
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-200">
                    {health?.stellar_network ?? "…"}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/35 px-3 py-1 font-mono">
                  <span className="text-slate-400">Last sync</span>
                  <span className="text-slate-200">{lastUpdated ?? "…"}</span>
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/35 px-3 py-1 font-mono">
                  <span className="text-slate-400">Rows</span>
                  <span className="text-slate-200">{deployments.length}</span>
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="btn-primary disabled:opacity-60"
                  disabled={isFetching}
                  aria-busy={isFetching ? "true" : "false"}
                >
                  {isFetching ? "Refreshing…" : "Refresh"}
                </button>
                <a
                  href="/connect"
                  className="btn-ghost"
                  title="Connect a wallet to sign approvals"
                >
                  Wallet
                </a>
              </div>
              <div className="flex flex-col gap-1 text-[11px] text-slate-400 sm:text-right">
                <span>
                  Network:{" "}
                  <span className="font-mono text-slate-200">
                    {health?.stellar_network ?? "…"}
                  </span>
                </span>
                <span className="text-slate-500">
                  Tip: connect a wallet to sign multisig approvals.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {errMsg && (
        <div className="panel relative overflow-hidden border-rose-500/40 bg-rose-950/25 px-4 py-3 text-sm text-rose-200">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(520px circle at 10% 0%, rgba(244,63,94,0.18), transparent 55%), radial-gradient(520px circle at 65% 110%, rgba(251,113,133,0.10), transparent 55%)",
            }}
          />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-200/80">
                Data fetch failed
              </div>
              <div className="mt-1 break-words text-rose-100/90">{errMsg}</div>
            </div>
          <button
            type="button"
            onClick={() => void refetch()}
              className="shrink-0 rounded-full border border-rose-500/40 bg-rose-950/30 px-3 py-1 text-xs font-medium text-rose-100/90 shadow-sm shadow-black/20 hover:bg-rose-950/45"
          >
              Retry
          </button>
          </div>
        </div>
      )}

      <LiveStatusBar />

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <section className="lg:col-span-12">
          {isLoading && !history ? (
            <MetricCardsSkeleton />
          ) : (
            <MetricCards deployments={deployments} />
          )}
        </section>

        <section className="lg:col-span-8">
          {isLoading && !history ? (
            <ChartSkeleton />
          ) : (
            <DeploymentChart data={chartData} />
          )}
        </section>

        <section className="lg:col-span-4">
          <div className="lg:sticky lg:top-20">
            {isLoading && !history ? (
              <FeedSkeleton />
            ) : (
              <LiveDeploymentFeed deployments={deployments} network={net} />
            )}
          </div>
        </section>

        <section className="lg:col-span-12">
          {isLoading && !history ? (
            <div className="panel p-6">
              <div className="h-6 w-48 animate-pulse rounded-md bg-slate-800/80" />
              <div className="mt-4 h-40 w-full animate-pulse rounded-md bg-slate-800/60" />
            </div>
          ) : (
            <DeploymentsTable
              deployments={deployments}
              isRefreshing={isFetching}
              onRefresh={() => void refetch()}
            />
          )}
        </section>
      </div>
    </div>
  );
}
