"use client";

import { useDeploymentStore } from "@/store/deploymentStore";
import { cn } from "@/lib/cn";

export function ToastNotifications() {
  const toasts = useDeploymentStore((s) => s.toasts);
  const dismiss = useDeploymentStore((s) => s.dismissToast);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cn(
            "pointer-events-auto w-full rounded-lg border px-4 py-3 text-left shadow-xl backdrop-blur transition",
            t.variant === "success" &&
              "border-emerald-500/40 bg-emerald-950/90 text-emerald-50",
            t.variant === "error" &&
              "border-rose-500/40 bg-rose-950/90 text-rose-50",
            t.variant === "info" &&
              "border-slate-600 bg-slate-900/95 text-slate-100",
          )}
        >
          <p className="text-sm font-semibold">{t.title}</p>
          {t.message && (
            <p className="mt-1 line-clamp-3 text-xs text-slate-300/90">
              {t.message}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}
