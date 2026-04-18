"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";

import { StatusBadge } from "@/components/status-badge";
import { DashboardHeroSkeleton } from "@/components/skeletons";
import { formatTimeAgo } from "@/lib/time";
import { useDeploymentsHistoryQuery, useHealthQuery } from "@/lib/queries";
import { useDeploymentStore } from "@/store/deploymentStore";
import { apiNetworkToId } from "@/lib/stellar-expert";
import type { Deployment } from "@/store/deploymentStore";

const pipeline = [
  {
    title: "Evaluate",
    body: "Scorecard checks coverage, latency, errors, and security signals before anything ships.",
    tag: "Policy",
  },
  {
    title: "Approve",
    body: "Multisig sessions collect signatures on Soroban when risk thresholds require human gates.",
    tag: "Multisig",
  },
  {
    title: "Deploy",
    body: "CI emits deployment events; the API records hashes, ledgers, and proof payloads for audit.",
    tag: "Ship",
  },
  {
    title: "Verify & rollback",
    body: "Live metrics can auto-rollback unsafe releases; operators can always intervene manually.",
    tag: "Operate",
  },
] as const;

function sortRecent(items: Deployment[]) {
  return [...items].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

export default function DeploymentsHubPage() {
  const setApiNet = useDeploymentStore((s) => s.setApiStellarNetwork);
  const walletNet = useDeploymentStore((s) => s.stellarNetwork);
  const apiNet = useDeploymentStore((s) => s.apiStellarNetwork);

  const { data: health } = useHealthQuery();
  const {
    data: history,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    dataUpdatedAt,
  } = useDeploymentsHistoryQuery(120);

  useEffect(() => {
    if (health?.stellar_network) setApiNet(health.stellar_network);
  }, [health, setApiNet]);

  const items = history?.items;
  const recent = useMemo(() => sortRecent(items ?? []).slice(0, 10), [items]);
  const deployments = items ?? [];
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
        <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/40 p-6 sm:p-8">
          <DashboardHeroSkeleton />
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900/40 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(760px circle at 12% 0%, rgba(51,150,255,0.20), transparent 52%), radial-gradient(720px circle at 78% 18%, rgba(168,85,247,0.16), transparent 52%), radial-gradient(700px circle at 50% 110%, rgba(16,185,129,0.10), transparent 58%)",
              }}
            />
            <div
              className="absolute inset-0 opacity-35"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(148,163,184,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
                maskImage:
                  "radial-gradient(520px circle at 30% 30%, black 28%, transparent 72%)",
                WebkitMaskImage:
                  "radial-gradient(520px circle at 30% 30%, black 28%, transparent 72%)",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950/45" />
          </div>

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-stellar-400/90 shadow-[0_0_0_4px_rgba(51,150,255,0.12)]" />
                  Deployments
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/40 px-3 py-1 font-mono text-[11px] text-slate-400">
                  <span className="text-slate-500">Network</span>
                  <span className="text-slate-200">{net}</span>
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                From commit to on-chain proof
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300/90">
                Follow how releases move through policy, approvals, deployment, and verification —
                then drill into any run for scorecards, Soroban activity, and rollback history.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/35 px-3 py-1 font-mono">
                  <span className="text-slate-400">Tracked</span>
                  <span className="text-slate-200">{deployments.length}</span>
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/35 px-3 py-1 font-mono">
                  <span className="text-slate-400">Last sync</span>
                  <span className="text-slate-200">{lastUpdated ?? "…"}</span>
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 lg:items-end">
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
                <Link href="/dashboard" className="btn-ghost">
                  Mission control
                </Link>
              </div>
              <p className="max-w-sm text-[11px] text-slate-500 lg:text-right">
                Use Overview for charts and the full table; this page highlights the release path and
                latest activity.
              </p>
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {pipeline.map((step) => (
          <div
            key={step.title}
            className="panel relative overflow-hidden p-5 transition hover:border-slate-700/90"
          >
            <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(420px_circle_at_20%_0%,rgba(51,150,255,0.10),transparent_55%)]" />
            <div className="relative">
              <span className="inline-flex rounded-full border border-slate-800 bg-slate-950/40 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {step.tag}
              </span>
              <h2 className="mt-3 text-base font-semibold text-white">{step.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.body}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="panel overflow-hidden">
        <header className="panel-header flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Recent activity
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">Latest deployments</h2>
            <p className="mt-1 text-xs text-slate-500">
              Newest updates across environments. Open a row for scorecards, approvals, and Stellar
              proof.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-xs font-semibold text-stellar-300 underline decoration-white/10 underline-offset-4 hover:text-stellar-200"
          >
            Full table on Overview →
          </Link>
        </header>

        <div className="divide-y divide-slate-800/80">
          {isLoading && !history ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              No deployments yet. Trigger a workflow or seed demo data to populate history.
            </div>
          ) : (
            recent.map((d) => (
              <Link
                key={d.id}
                href={`/deployments/${d.id}`}
                className="group flex flex-col gap-3 px-4 py-4 transition hover:bg-slate-900/35 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-100 group-hover:text-white">
                    {d.repo}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500">
                    <span className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-0.5 text-slate-300">
                      {d.environment}
                    </span>
                    <span className="rounded-md bg-slate-950/40 px-2 py-0.5 text-slate-400">
                      {d.branch}
                    </span>
                    <span className="truncate text-slate-600" title={d.deployment_key}>
                      {d.deployment_key}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
                  <StatusBadge status={d.status} />
                  <div className="text-right font-mono text-[12px] text-slate-400">
                    {formatTimeAgo(d.updated_at)}
                  </div>
                  <span className="hidden text-slate-600 transition group-hover:text-stellar-300 sm:inline">
                    →
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
