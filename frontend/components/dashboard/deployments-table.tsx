"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { Deployment } from "@/store/deploymentStore";
import { cn } from "@/lib/cn";
import { StatusBadge } from "@/components/status-badge";
import { formatTimeAgo, formatIso } from "@/lib/time";

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "rolled_back";

function normalizeStatus(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "_");
}

function shortHash(sha: string): string {
  return sha.length > 7 ? sha.slice(0, 7) : sha;
}

function shortAddr(a: string): string {
  if (a.length <= 14) return a;
  return `${a.slice(0, 6)}…${a.slice(-5)}`;
}

function statusBucket(status: string): StatusFilter {
  const s = normalizeStatus(status);
  if (s === "succeeded") return "approved";
  if (s === "rolled_back") return "rolled_back";
  if (s === "failed" || s === "rejected") return "rejected";
  return "pending";
}

function FilterPill({
  active,
  label,
  onClick,
  count,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition",
        active
          ? "border-stellar-500/40 bg-stellar-500/10 text-stellar-200"
          : "border-slate-800 bg-slate-950/40 text-slate-300 hover:bg-slate-900/50 hover:text-white",
      )}
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-[10px]",
            active ? "bg-stellar-500/15 text-stellar-200" : "bg-slate-900 text-slate-400",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function DeploymentsTable({
  deployments,
  isRefreshing,
  onRefresh,
}: {
  deployments: Deployment[];
  isRefreshing?: boolean;
  onRefresh?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const normalizedQuery = query.trim().toLowerCase();

  const sorted = useMemo(() => {
    return [...deployments].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }, [deployments]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: deployments.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      rolled_back: 0,
    };
    for (const d of deployments) c[statusBucket(d.status)] += 1;
    return c;
  }, [deployments]);

  const filtered = useMemo(() => {
    return sorted.filter((d) => {
      if (filter !== "all" && statusBucket(d.status) !== filter) return false;
      if (!normalizedQuery) return true;
      const hay = [
        d.repo,
        d.branch,
        d.environment,
        d.status,
        d.commit_sha,
        d.deployer,
        d.deployment_key,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [sorted, filter, normalizedQuery]);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/30 shadow-xl shadow-black/20">
      <header className="flex flex-col gap-3 border-b border-slate-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-200">Deployments</h2>
          <p className="mt-1 text-xs text-slate-500">
            Search by repo, branch, environment, status, deployer, or commit.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <label className="relative w-full sm:w-[320px]">
            <span className="sr-only">Search deployments</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="input"
            />
          </label>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className={cn(
                "btn-ghost",
                isRefreshing && "opacity-70",
              )}
              aria-busy={isRefreshing ? "true" : "false"}
            >
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap gap-2 px-4 pt-4">
        <FilterPill
          label="All"
          active={filter === "all"}
          onClick={() => setFilter("all")}
          count={counts.all}
        />
        <FilterPill
          label="Pending"
          active={filter === "pending"}
          onClick={() => setFilter("pending")}
          count={counts.pending}
        />
        <FilterPill
          label="Approved"
          active={filter === "approved"}
          onClick={() => setFilter("approved")}
          count={counts.approved}
        />
        <FilterPill
          label="Rejected"
          active={filter === "rejected"}
          onClick={() => setFilter("rejected")}
          count={counts.rejected}
        />
        <FilterPill
          label="Rolled back"
          active={filter === "rolled_back"}
          onClick={() => setFilter("rolled_back")}
          count={counts.rolled_back}
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] border-separate border-spacing-0">
          <thead className="sticky top-[3.5rem] z-10 bg-slate-950/80 backdrop-blur-xl">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="border-b border-slate-800 px-4 py-3">Repo</th>
              <th className="border-b border-slate-800 px-4 py-3">Env</th>
              <th className="border-b border-slate-800 px-4 py-3">Branch</th>
              <th className="border-b border-slate-800 px-4 py-3">Commit</th>
              <th className="border-b border-slate-800 px-4 py-3">Status</th>
              <th className="border-b border-slate-800 px-4 py-3">Approvals</th>
              <th className="border-b border-slate-800 px-4 py-3">Deployer</th>
              <th className="border-b border-slate-800 px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {filtered.map((d) => (
              <tr key={d.id} className="group">
                <td className="border-b border-slate-800/70 px-4 py-3 align-top">
                  <Link
                    href={`/deployments/${d.id}`}
                    className="block max-w-[320px] truncate font-medium text-slate-100 underline-offset-4 group-hover:underline"
                    title={d.repo}
                  >
                    {d.repo}
                  </Link>
                  <div className="mt-1 font-mono text-[11px] text-slate-600">
                    {d.deployment_key}
                  </div>
                </td>
                <td className="border-b border-slate-800/70 px-4 py-3 font-mono text-[12px] text-slate-300">
                  <span className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1">
                    {d.environment}
                  </span>
                </td>
                <td className="border-b border-slate-800/70 px-4 py-3">
                  <span className="rounded-md bg-slate-950/40 px-2 py-1 font-mono text-[12px] text-slate-300">
                    {d.branch}
                  </span>
                </td>
                <td className="border-b border-slate-800/70 px-4 py-3 font-mono text-[12px] text-slate-300">
                  <span title={d.commit_sha}>{shortHash(d.commit_sha)}</span>
                </td>
                <td className="border-b border-slate-800/70 px-4 py-3">
                  <StatusBadge status={d.status} />
                </td>
                <td className="border-b border-slate-800/70 px-4 py-3 font-mono text-[12px] text-slate-300">
                  {d.approvals_count}
                </td>
                <td className="border-b border-slate-800/70 px-4 py-3 font-mono text-[12px] text-slate-300">
                  <span title={d.deployer}>{shortAddr(d.deployer)}</span>
                </td>
                <td className="border-b border-slate-800/70 px-4 py-3">
                  <div className="font-mono text-[12px] text-slate-300">
                    {formatTimeAgo(d.updated_at)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-600">
                    <span title={formatIso(d.updated_at)}>{d.updated_at.slice(0, 19)}</span>
                  </div>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">
                  No deployments match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

