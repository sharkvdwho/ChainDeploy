import { StatusBadge } from "@/components/status-badge";
import type { DeploymentHistoryItem } from "@/lib/api";
import { formatIso } from "@/lib/time";

export function DeploymentHeader({ dep }: { dep: DeploymentHistoryItem }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            {dep.repo}
          </h1>
          <p className="mt-1 font-mono text-sm text-slate-400">
            {dep.branch} · {dep.commit_sha}
          </p>
        </div>
        <StatusBadge status={dep.status} />
      </div>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Deployer
          </dt>
          <dd className="mt-1 font-mono text-xs text-slate-200">{dep.deployer}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Environment
          </dt>
          <dd className="mt-1 text-sm text-slate-200">{dep.environment}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Created
          </dt>
          <dd className="mt-1 text-sm text-slate-200">{formatIso(dep.created_at)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Updated
          </dt>
          <dd className="mt-1 text-sm text-slate-200">{formatIso(dep.updated_at)}</dd>
        </div>
      </dl>
    </div>
  );
}
