import { cn } from "@/lib/cn";

const MAP: Record<
  string,
  { label: string; className: string }
> = {
  succeeded: {
    label: "APPROVED",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  pending_approval: {
    label: "PENDING",
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-200",
  },
  in_progress: {
    label: "PENDING",
    className:
      "border-sky-500/40 bg-sky-500/10 text-sky-200",
  },
  pending: {
    label: "PENDING",
    className:
      "border-slate-500/40 bg-slate-500/10 text-slate-200",
  },
  failed: {
    label: "REJECTED",
    className: "border-rose-500/40 bg-rose-500/10 text-rose-200",
  },
  rejected: {
    label: "REJECTED",
    className: "border-rose-500/40 bg-rose-500/10 text-rose-200",
  },
  rolled_back: {
    label: "ROLLED_BACK",
    className:
      "border-violet-500/40 bg-violet-500/10 text-violet-200",
  },
};

function normalize(status: string): string {
  return status.toLowerCase().replace(/\s+/g, "_");
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = normalize(status);
  const cfg = MAP[key] ?? {
    label: status.toUpperCase().replace(/_/g, " "),
    className: "border-slate-600 bg-slate-800/80 text-slate-300",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
        cfg.className,
        className,
      )}
    >
      {cfg.label}
    </span>
  );
}
