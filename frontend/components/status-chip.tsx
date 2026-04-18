"use client";

import { motion } from "framer-motion";

const styles: Record<string, string> = {
  idle: "bg-slate-700 text-slate-200",
  connecting: "bg-amber-900/80 text-amber-100",
  connected: "bg-emerald-900/80 text-emerald-100",
  error: "bg-red-900/80 text-red-100",
};

export function StatusChip({
  label,
  state,
}: {
  label: string;
  state: keyof typeof styles;
}) {
  return (
    <motion.span
      layout
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${styles[state]}`}
    >
      {label}: {state}
    </motion.span>
  );
}
