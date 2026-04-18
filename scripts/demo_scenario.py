#!/usr/bin/env python3
"""
ChainDeploy — competition demo driver (scenarios A / B / C).

Prerequisites:
  - Backend running with contracts + keys from setup_stellar.py
  - `pip install -r scripts/requirements.txt`
  - Environment from `.env.chaindemo` or `backend/.env`

Usage:
  python scripts/demo_scenario.py --api http://localhost:8000 --scenario all
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "scripts"))

from stellar_tools import (  # noqa: E402
    DEFAULT_RPC,
    TESTNET_PASSPHRASE,
    multisig_create_session,
)
from stellar_sdk.keypair import Keypair  # noqa: E402


def load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    for p in (
        REPO_ROOT / ".env.chaindemo",
        REPO_ROOT / "backend" / ".env.generated",
        REPO_ROOT / "backend" / ".env",
        REPO_ROOT / ".env",
    ):
        if p.is_file():
            load_dotenv(p)


def horizon_latest_ledger(horizon_url: str) -> int:
    r = httpx.get(f"{horizon_url.rstrip('/')}/ledgers", params={"order": "desc", "limit": 1}, timeout=30.0)
    r.raise_for_status()
    rec = r.json()["_embedded"]["records"][0]
    return int(rec["sequence"])


def evaluate_payload(
    *,
    deployment_id: str,
    repo: str,
    sha: str,
    branch: str,
    coverage: int,
    er_delta: int,
    perf: int,
    security: bool,
    deployer_secret: str,
) -> dict[str, Any]:
    return {
        "repository": {"full_name": repo},
        "sha": sha,
        "ref": f"refs/heads/{branch}",
        "client_payload": {
            "deployment_id": deployment_id,
            "test_coverage": coverage,
            "error_rate_delta": er_delta,
            "performance_score": perf,
            "security_scan_passed": security,
        },
        "deployer_secret": deployer_secret,
    }


def post_evaluate(
    client: httpx.Client,
    api: str,
    payload: dict[str, Any],
    token: str | None,
) -> dict[str, Any]:
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = client.post(f"{api.rstrip('/')}/api/deployments/evaluate", json=payload, headers=headers, timeout=120.0)
    if r.status_code >= 400:
        raise RuntimeError(f"evaluate {r.status_code}: {r.text}")
    return r.json()


def post_approve(
    client: httpx.Client,
    api: str,
    deployment_uuid: str,
    approver_secret: str,
) -> dict[str, Any]:
    r = client.post(
        f"{api.rstrip('/')}/api/deployments/{deployment_uuid}/approve",
        json={"approver_secret": approver_secret},
        timeout=120.0,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"approve {r.status_code}: {r.text}")
    return r.json()


def post_rollback(
    client: httpx.Client,
    api: str,
    deployment_uuid: str,
    *,
    error_rate: int,
    latency_ms: int,
    crash_count: int,
    triggered_by: str,
    initiator_secret: str,
) -> dict[str, Any]:
    body = {
        "metrics": {
            "error_rate": error_rate,
            "latency_ms": latency_ms,
            "crash_count": crash_count,
        },
        "triggered_by": triggered_by,
        "initiator_secret": initiator_secret,
    }
    r = client.post(
        f"{api.rstrip('/')}/api/deployments/{deployment_uuid}/rollback",
        json=body,
        timeout=120.0,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"rollback {r.status_code}: {r.text}")
    return r.json()


def narrate(msg: str, delay: float = 0.0) -> None:
    print(f"\n▶ {msg}")
    if delay > 0:
        time.sleep(delay)


def scenario_a(client: httpx.Client, api: str, deployer_secret: str, token: str | None) -> None:
    narrate("Scenario A — Perfect deployment (target ~30s)", 0)
    did = f"demo-scenario-a-{int(time.time())}"
    sha = "a" * 40
    narrate("Submitting passing scorecard (coverage 95, no error delta, perf 92, security OK)…")
    payload = evaluate_payload(
        deployment_id=did,
        repo="chaindeploy/demo-perfect",
        sha=sha,
        branch="main",
        coverage=95,
        er_delta=0,
        perf=92,
        security=True,
        deployer_secret=deployer_secret,
    )
    out = post_evaluate(client, api, payload, token)
    print(json.dumps(out, indent=2))
    narrate("Autonomous APPROVED decision recorded; Stellar tx submitted.", 2.0)
    narrate(f"Dashboard: open deployment {out.get('deployment_uuid')} — WebSocket should broadcast evaluate.", 8.0)
    remaining = max(0.0, 30.0 - 10.0)
    narrate(f"Holding for live dashboard refresh ({remaining:.0f}s)…", remaining)


def scenario_b(
    client: httpx.Client,
    api: str,
    deployer_secret: str,
    approver_secrets: list[str],
    multisig_id: str,
    horizon_url: str,
    rpc_url: str,
    token: str | None,
) -> None:
    narrate("Scenario B — Risky deployment → pending approval → multisig (~45s)", 0)
    did = f"demo-scenario-b-{int(time.time())}"
    sha = "b" * 40
    narrate("Submitting borderline scorecard (coverage 78 → pending approval gate)…")
    payload = evaluate_payload(
        deployment_id=did,
        repo="chaindeploy/demo-risky",
        sha=sha,
        branch="main",
        coverage=78,
        er_delta=3,
        perf=72,
        security=True,
        deployer_secret=deployer_secret,
    )
    out = post_evaluate(client, api, payload, token)
    print(json.dumps(out, indent=2))
    dep_uuid = str(out["deployment_uuid"])
    assert out.get("decision") == "PENDING_APPROVAL"

    narrate("Creating on-chain MultiSig session (2 approvers, quorum 2)…", 2.0)
    dep_kp = Keypair.from_secret(deployer_secret)
    a1 = Keypair.from_secret(approver_secrets[0])
    a2 = Keypair.from_secret(approver_secrets[1])
    exp = horizon_latest_ledger(horizon_url) + 250_000
    multisig_create_session(
        multisig_id,
        dep_kp,
        did,
        2,
        [a1.public_key, a2.public_key],
        exp,
        rpc_url=rpc_url,
        network_passphrase=TESTNET_PASSPHRASE,
    )

    narrate("Approver 1 signing approve() via API…", 3.0)
    r1 = post_approve(client, api, dep_uuid, approver_secrets[0])
    print(json.dumps(r1, indent=2))
    narrate("Approver 2 signing approve() via API…", 5.0)
    r2 = post_approve(client, api, dep_uuid, approver_secrets[1])
    print(json.dumps(r2, indent=2))
    narrate("Threshold met — multisig approvals recorded on-chain + DB.", 10.0)
    narrate("Check dashboard: deployment should list pending + approval rows.", max(0.0, 45.0 - 25.0))


def write_incident_report(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "# ChainDeploy — Incident report (Scenario C)\n\n"
        f"**Deployment UUID:** `{data.get('deployment_uuid')}`\n\n"
        f"**Deployment key:** `{data.get('deployment_key')}`\n\n"
        "**Rollback trigger:** AUTO (Soroban RollbackEngine thresholds)\n\n"
        "**Metrics at trigger:**\n"
        f"- error_rate: {data.get('error_rate')}\n"
        f"- latency_ms: {data.get('latency_ms')}\n"
        f"- crash_count: {data.get('crash_count')}\n\n"
        f"**Stellar rollback tx:** `{data.get('rollback_tx')}`\n\n"
        "**Narrative:** Production traffic simulation showed SLO breach; "
        "ChainDeploy fired an automatic rollback and recorded the audit row on Stellar.\n",
        encoding="utf-8",
    )


def scenario_c(
    client: httpx.Client,
    api: str,
    deployer_secret: str,
    initiator_secret: str,
    token: str | None,
) -> None:
    narrate("Scenario C — Good deploy, then AUTO rollback after synthetic SLO breach (~30s + wait)", 0)
    did = f"demo-scenario-c-{int(time.time())}"
    sha = "c" * 40
    narrate("Phase 1 — Passing scorecard (deployment succeeds)…")
    out = post_evaluate(
        client,
        api,
        evaluate_payload(
            deployment_id=did,
            repo="chaindeploy/demo-rollback",
            sha=sha,
            branch="main",
            coverage=92,
            er_delta=1,
            perf=88,
            security=True,
            deployer_secret=deployer_secret,
        ),
        token,
    )
    print(json.dumps(out, indent=2))
    dep_uuid = str(out["deployment_uuid"])

    narrate("Waiting 10s (simulating stable prod window)…", 10.0)
    narrate(
        "Phase 2 — Submitting AUTO rollback with error_rate=25, latency_ms=3000 (breach: >10 and >2000)…",
        0,
    )
    rb = post_rollback(
        client,
        api,
        dep_uuid,
        error_rate=25,
        latency_ms=3000,
        crash_count=0,
        triggered_by="AUTO",
        initiator_secret=initiator_secret,
    )
    print(json.dumps(rb, indent=2))
    narrate("Rollback confirmed on Stellar + rollback_events row in API.", 2.0)

    report = {
        "deployment_uuid": dep_uuid,
        "deployment_key": did,
        "error_rate": 25,
        "latency_ms": 3000,
        "crash_count": 0,
        "rollback_tx": rb.get("tx_hash"),
    }
    out_path = REPO_ROOT / "demo_output" / "incident_report_scenario_c.md"
    write_incident_report(out_path, report)
    narrate(f"Incident report written to {out_path}", 5.0)
    narrate("Hold for dashboard / WS (~15s)…", 15.0)


def main() -> None:
    load_env()
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default=os.getenv("CHAINDEPLOY_API_URL", "http://127.0.0.1:8000"))
    parser.add_argument(
        "--scenario",
        choices=["a", "b", "c", "all"],
        default="all",
    )
    args = parser.parse_args()

    deployer = os.environ.get("CHAIN_DEPLOY_DEPLOYER_SECRET", "")
    appr1 = os.environ.get("CHAIN_DEPLOY_APPROVER_1_SECRET", "")
    appr2 = os.environ.get("CHAIN_DEPLOY_APPROVER_2_SECRET", "")
    multisig = os.environ.get("MULTISIG_APPROVAL_CONTRACT_ID", "")
    horizon = os.environ.get("HORIZON_URL", "https://horizon-testnet.stellar.org")
    rpc = os.environ.get("SOROBAN_RPC_URL", DEFAULT_RPC)
    token = os.environ.get("CI_WEBHOOK_TOKEN") or None

    if not deployer:
        print("Missing CHAIN_DEPLOY_DEPLOYER_SECRET", file=sys.stderr)
        sys.exit(1)

    api = args.api
    with httpx.Client() as client:
        if args.scenario in ("a", "all"):
            scenario_a(client, api, deployer, token)
        if args.scenario in ("b", "all"):
            if not appr1 or not appr2 or not multisig:
                print("Scenario B needs CHAIN_DEPLOY_APPROVER_1_SECRET, _2, MULTISIG_APPROVAL_CONTRACT_ID", file=sys.stderr)
                sys.exit(1)
            scenario_b(client, api, deployer, [appr1, appr2], multisig, horizon, rpc, token)
        if args.scenario in ("c", "all"):
            scenario_c(client, api, deployer, deployer, token)

    print("\n✓ Demo scenario(s) complete.\n")


if __name__ == "__main__":
    main()
