"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/cn";
import { Navbar } from "@/components/navbar";

const features = [
  {
    title: "Autonomous decisions",
    body: "CI scorecards are evaluated against policy gates. Pass or fail is recorded on Soroban—no opaque “approve” button in a siloed UI.",
    accent: "from-emerald-500/20 to-teal-500/5",
  },
  {
    title: "Immutable audit trail",
    body: "Every evaluation, approval, and rollback leaves a cryptographic trail you can verify on Stellar Expert—perfect for regulated teams.",
    accent: "from-stellar-500/20 to-indigo-500/5",
  },
  {
    title: "Zero-blame rollbacks",
    body: "When SLOs breach, RollbackEngine can fire AUTO rollbacks with the same metrics snapshot operators already trust—accountability without the finger-pointing.",
    accent: "from-violet-500/20 to-fuchsia-500/5",
  },
];

const steps = [
  { n: "1", title: "Code pushed", sub: "GitHub Actions runs tests & scans" },
  { n: "2", title: "CI evaluates", sub: "Coverage, errors, perf, security → scorecard" },
  { n: "3", title: "Stellar decides", sub: "DeploymentDecision + MultiSig on Soroban" },
  { n: "4", title: "Deploy or rollback", sub: "Green light, or controlled rollback with proof" },
];

const sampleTx = {
  type: "INVOKE_HOST_FUNCTION",
  contract: "CDEMO…DEPLOY",
  fn: "evaluate",
  params: ["coverage=94", "Δerrors=2", "perf=88", "security=true"],
  hash: "a1b2c3d4e5f6…9e0f",
  ledger: "12_884_201",
};

function HeroDemo() {
  const reduce = useReducedMotion();
  const phases = [
    { label: "CI", status: "passing", t: 0 },
    { label: "Scorecard", status: "evaluating", t: 0.4 },
    { label: "Soroban", status: "submitting", t: 0.8 },
    { label: "Decision", status: "approved", t: 1.2 },
  ];

  return (
    <div className="relative mt-10 overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/40 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-7">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(820px circle at 14% 0%, rgba(56,189,248,0.18), transparent 55%), radial-gradient(760px circle at 76% 18%, rgba(168,85,247,0.14), transparent 54%), radial-gradient(820px circle at 50% 120%, rgba(16,185,129,0.10), transparent 58%)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950/55" />
      </div>
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Live pipeline preview
          </p>
          <p className="mt-1 font-mono text-sm text-slate-300">
            acme/payments · main ·{" "}
            <span className="text-stellar-400">7f3a9c2</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-xs font-medium text-emerald-400">Streaming</span>
        </div>
      </div>
      <div className="relative mt-6 grid gap-3 sm:grid-cols-4">
        {phases.map((p, i) => (
          <motion.div
            key={p.label}
            initial={reduce ? false : { opacity: 0.3, y: 6 }}
            animate={reduce ? {} : { opacity: 1, y: 0 }}
            transition={{ delay: p.t, duration: 0.45, ease: "easeOut" }}
            className={cn(
              "rounded-xl border px-3 py-3",
              p.status === "approved"
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-slate-700/80 bg-slate-900/60",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {p.label}
            </p>
            <p className="mt-1 text-sm font-medium capitalize text-slate-100">
              {p.status}
            </p>
            <motion.div
              className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800"
              initial={false}
            >
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-stellar-500 to-emerald-400"
                initial={{ width: "8%" }}
                animate={{ width: reduce ? "100%" : "100%" }}
                transition={{
                  delay: p.t + 0.1,
                  duration: reduce ? 0 : 1.4,
                  ease: "easeInOut",
                }}
              />
            </motion.div>
          </motion.div>
        ))}
      </div>
      <p className="relative mt-4 text-center text-[11px] text-slate-500">
        Simulated timing for demo · real ChainDeploy streams from your CI + Stellar testnet
      </p>
    </div>
  );
}

export function LandingPage() {
  const reduce = useReducedMotion();

  return (
    <div className="relative min-h-screen">
      <div className="app-backdrop" aria-hidden="true" />
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
        <motion.section
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/35 px-6 py-10 shadow-2xl shadow-black/30 backdrop-blur sm:px-10"
        >
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(950px circle at 14% 10%, rgba(56,189,248,0.22), transparent 55%), radial-gradient(900px circle at 78% 18%, rgba(168,85,247,0.18), transparent 54%), radial-gradient(900px circle at 50% 125%, rgba(16,185,129,0.10), transparent 60%)",
              }}
            />
            <div
              className="absolute inset-0 opacity-35"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(148,163,184,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
                maskImage:
                  "radial-gradient(640px circle at 50% 30%, black 32%, transparent 72%)",
                WebkitMaskImage:
                  "radial-gradient(640px circle at 50% 30%, black 32%, transparent 72%)",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950/55" />
          </div>

          <div className="relative text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-stellar-300/90">
              Stellar · Soroban · GitHub Actions
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl md:leading-[1.06]">
              Deploy with confidence.
              <br />
              <span className="bg-gradient-to-br from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Autonomous, transparent, on-chain.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300/90 sm:text-lg">
              ChainDeploy turns CI outcomes into verifiable smart-contract decisions—so
              teams ship faster without losing auditability.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/dashboard" className="btn-primary w-full sm:w-auto">
                View live dashboard
              </Link>
              <Link href="/connect" className="btn-ghost w-full sm:w-auto">
                Connect wallet
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-800/80 bg-slate-950/35 px-3 py-1 font-mono">
                Policy gates
              </span>
              <span className="rounded-full border border-slate-800/80 bg-slate-950/35 px-3 py-1 font-mono">
                Multisig approvals
              </span>
              <span className="rounded-full border border-slate-800/80 bg-slate-950/35 px-3 py-1 font-mono">
                Auto rollbacks
              </span>
              <span className="rounded-full border border-slate-800/80 bg-slate-950/35 px-3 py-1 font-mono">
                On-chain proof
              </span>
            </div>
          </div>
        </motion.section>

        <HeroDemo />

        <section className="mt-16">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Why teams adopt ChainDeploy
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                A modern release control plane
              </h2>
            </div>
            <Link
              href="/dashboard"
              className="text-sm font-semibold text-stellar-300 underline decoration-white/10 underline-offset-4 hover:text-stellar-200"
            >
              Explore the dashboard →
            </Link>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {features.map((f, i) => (
              <motion.article
                key={f.title}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                className={cn(
                  "rounded-3xl border border-slate-800/80 bg-gradient-to-b p-6 shadow-xl shadow-black/20 backdrop-blur",
                  f.accent,
                )}
              >
                <h3 className="text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  {f.body}
                </p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <div className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    How it works
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
                    From CI signal → on-chain decision
                  </h2>
                </div>
                <span className="rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1 font-mono text-[10px] text-slate-400">
                  Deterministic policy gates
                </span>
              </div>
            </div>
            <div className="p-6 sm:p-8">
              <div className="grid gap-6 md:grid-cols-4">
                {steps.map((s, i) => (
                  <div key={s.n} className="relative text-center">
                    {i < steps.length - 1 && (
                      <div className="absolute left-[60%] top-8 hidden h-px w-[80%] bg-gradient-to-r from-slate-700 to-transparent md:block" />
                    )}
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-stellar-500/40 bg-stellar-500/10 font-mono text-lg font-bold text-stellar-300">
                      {s.n}
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-white">{s.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <div className="panel overflow-hidden p-8 sm:p-10">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold text-white">
                Why blockchain—not just another dashboard
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                Centralized deployment tools can rewrite history. ChainDeploy anchors decisions
                on Stellar so every approve, reject, and rollback has a public, tamper-evident
                record. Soroban contracts encode your policy; the ledger encodes the truth.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-slate-300">
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  Contract-enforced gates (coverage, SLOs, security)
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  Multi-sig approvals with session expiry
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  Rollback audit rows with AUTO vs MANUAL triggers
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 font-mono text-[11px] leading-relaxed text-slate-400 shadow-inner">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Sample invoke_host_function (truncated)
              </p>
              <pre className="mt-3 overflow-x-auto text-stellar-300/90">
                {JSON.stringify(sampleTx, null, 2)}
              </pre>
              <a
                href="https://stellar.expert/explorer/testnet"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex text-xs font-semibold text-stellar-400 hover:text-stellar-300"
              >
                Open Stellar Expert (testnet) →
              </a>
            </div>
          </div>
          </div>
        </section>

        <motion.section
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-24 text-center"
        >
          <h2 className="text-xl font-semibold text-white sm:text-2xl">
            Ready to see it live?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-slate-500">
            Open the mission-control dashboard: live deployments, charts, and Stellar links
            from your running API.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/dashboard" className="btn-primary w-full sm:w-auto">
              View live dashboard
            </Link>
            <Link
              href="/connect"
              className="btn-ghost w-full sm:w-auto"
              title="Connect a wallet to sign approvals"
            >
              Connect wallet
            </Link>
          </div>
        </motion.section>
      </main>

      <footer className="border-t border-slate-900 py-10 text-center text-xs text-slate-600">
        ChainDeploy — autonomous deployment intelligence on Stellar.
      </footer>
    </div>
  );
}
