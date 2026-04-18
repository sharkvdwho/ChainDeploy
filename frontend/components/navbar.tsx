"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useDeploymentStore } from "@/store/deploymentStore";
import { cn } from "@/lib/cn";
import { apiNetworkToId } from "@/lib/stellar-expert";

const links = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Overview" },
  { href: "/deployments", label: "Deployments" },
  { href: "/connect", label: "Wallet" },
];

export function Navbar() {
  const pathname = usePathname();
  const walletAddress = useDeploymentStore((s) => s.walletAddress);
  const isConnected = useDeploymentStore((s) => s.isConnected);
  const stellarNetwork = useDeploymentStore((s) => s.stellarNetwork);
  const apiNet = useDeploymentStore((s) => s.apiStellarNetwork);
  const netLabel = apiNetworkToId(apiNet ?? "testnet");

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <header className="sticky top-0 z-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-slate-950/80 via-slate-950/40 to-transparent" />
      <div className="border-b border-slate-800/70 bg-slate-950/55 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-10">
            <Link href="/" className="group flex items-center">
              <span className="relative font-brand text-sm font-semibold tracking-tight text-white">
                <span className="bg-gradient-to-r from-stellar-300 via-slate-100 to-violet-200 bg-clip-text text-transparent">
                  ChainDeploy
                </span>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-x-1 -bottom-1 h-px bg-gradient-to-r from-transparent via-stellar-500/50 to-transparent opacity-0 transition group-hover:opacity-100"
                />
              </span>
            </Link>
            <nav className="hidden gap-1 sm:flex">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "group relative rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                    isActive(l.href)
                      ? "bg-slate-900/65 text-white ring-1 ring-white/5"
                      : "text-slate-400 hover:bg-slate-900/45 hover:text-slate-100",
                  )}
                >
                  {isActive(l.href) && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-4 -bottom-[9px] h-px bg-gradient-to-r from-transparent via-stellar-500/60 to-transparent"
                    />
                  )}
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <span
              className={cn(
                "hidden items-center gap-2 rounded-full border bg-slate-950/30 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider sm:inline-flex",
                netLabel === "mainnet"
                  ? "border-emerald-500/30 text-emerald-300"
                  : "border-sky-500/30 text-sky-300",
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current/70" />
              API · {netLabel}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border bg-slate-950/30 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                stellarNetwork === "mainnet"
                  ? "border-emerald-500/30 text-emerald-300"
                  : "border-sky-500/30 text-sky-300",
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current/70" />
              Wallet · {stellarNetwork}
            </span>
            <span className="hidden h-5 w-px bg-slate-800/80 sm:inline" />
            {isConnected && walletAddress ? (
              <Link
                href="/connect"
                className="max-w-[220px] truncate rounded-full border border-slate-800 bg-slate-950/30 px-3 py-1 font-mono text-[11px] text-slate-200 transition hover:bg-slate-900/45"
                title={walletAddress}
              >
                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </Link>
            ) : (
              <Link
                href="/connect"
                className="rounded-full bg-gradient-to-r from-stellar-600 to-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-stellar-900/30 ring-1 ring-white/10 transition hover:brightness-110"
              >
                Connect
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
