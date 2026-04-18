import { cn } from "@/lib/cn";

type Score = {
  test_coverage?: number;
  error_rate_delta?: number;
  performance_score?: number;
  security_scan_passed?: boolean;
};

function Bar({
  label,
  value,
  max,
  pass,
  suffix = "",
}: {
  label: string;
  value: number;
  max: number;
  pass: boolean;
  suffix?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span
          className={cn(
            "font-mono",
            pass ? "text-emerald-400" : "text-rose-400",
          )}
        >
          {value}
          {suffix}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pass ? "bg-emerald-500/80" : "bg-rose-500/80",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ScorecardPanel({ scorecard }: { scorecard: Score | null }) {
  if (!scorecard || Object.keys(scorecard).length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="text-sm font-semibold text-slate-200">Scorecard</h2>
        <p className="mt-2 text-sm text-slate-500">No scorecard payload stored.</p>
      </div>
    );
  }

  const cov = Number(scorecard.test_coverage ?? 0);
  const err = Number(scorecard.error_rate_delta ?? 0);
  const perf = Number(scorecard.performance_score ?? 0);
  const sec = Boolean(scorecard.security_scan_passed);

  const passCov = cov >= 80;
  const passErr = err <= 5;
  const passPerf = perf >= 70;
  const passSec = sec;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-sm font-semibold text-slate-200">CI scorecard</h2>
      <p className="mt-1 text-xs text-slate-500">
        Gates mirror Soroban DeploymentDecision: coverage ≥80, |Δerror| ≤5, perf
        ≥70, security required.
      </p>
      <div className="mt-6 space-y-5">
        <Bar label="Test coverage (≥80)" value={cov} max={100} pass={passCov} />
        <Bar
          label="Error rate Δ (≤5)"
          value={Math.min(Math.max(err, 0), 20)}
          max={20}
          pass={passErr}
        />
        <Bar
          label="Performance score (≥70)"
          value={perf}
          max={100}
          pass={passPerf}
        />
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Security scan</span>
            <span
              className={cn(
                "font-mono",
                passSec ? "text-emerald-400" : "text-rose-400",
              )}
            >
              {sec ? "PASS" : "FAIL"}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className={cn(
                "h-full rounded-full",
                passSec ? "w-full bg-emerald-500/80" : "w-1/4 bg-rose-500/80",
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
