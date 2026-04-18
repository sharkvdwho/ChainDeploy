"use client";

import { useState } from "react";

import { stellarExpertTxUrl } from "@/lib/stellar-expert";
import type { StellarNetworkId } from "@/lib/stellar";
import { cn } from "@/lib/cn";

export function StellarTxLink({
  hash,
  network,
  className,
  showCopy = true,
}: {
  hash: string;
  network: StellarNetworkId;
  className?: string;
  showCopy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const short =
    hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
  const href = stellarExpertTxUrl(network, hash);

  const copy = async () => {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-xs text-slate-300",
        className,
      )}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-stellar-400 hover:text-stellar-300 underline-offset-2 hover:underline"
      >
        {short}
      </a>
      {showCopy && (
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded border border-slate-700 bg-slate-900/80 px-1.5 py-0.5 text-[10px] text-slate-400 hover:border-slate-600 hover:text-slate-200"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </span>
  );
}
