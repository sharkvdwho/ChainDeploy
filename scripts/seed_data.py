#!/usr/bin/env python3
"""
Populate PostgreSQL with ~30 days of synthetic deployment history for dashboard demos.

Usage:
  export DATABASE_URL=postgresql+asyncpg://chaindeploy:chaindeploy@127.0.0.1:5432/chaindeploy
  python scripts/seed_data.py

Requires: pip install -r scripts/requirements.txt
"""
from __future__ import annotations

import json
import os
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, text


def sync_database_url() -> str:
    raw = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://chaindeploy:chaindeploy@127.0.0.1:5432/chaindeploy",
    )
    if "+asyncpg" in raw:
        return raw.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    return raw


REPOS = [
    "acme/api-gateway",
    "acme/checkout-svc",
    "acme/ledger-worker",
    "chaindeploy/bootstrap",
    "northwind/edge-router",
    "contoso/payments",
]
BRANCHES = ["main", "staging", "release/v2"]


def random_sha() -> str:
    return "".join(random.choices("0123456789abcdef", k=40))


def random_scorecard() -> dict:
    cov = random.randint(65, 100)
    er = random.randint(-2, 8)
    perf = random.randint(55, 99)
    sec = random.random() > 0.08
    return {
        "test_coverage": cov,
        "error_rate_delta": er,
        "performance_score": perf,
        "security_scan_passed": sec,
        "decision": "APPROVED" if cov >= 80 and er <= 5 and perf >= 70 and sec else "PENDING_APPROVAL",
    }


def main() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        load_dotenv = None  # type: ignore
    if load_dotenv:
        load_dotenv()

    url = sync_database_url()
    engine = create_engine(url)
    rng = random.Random(42)
    now = datetime.now(timezone.utc)

    statuses = (
        ["succeeded"] * 55
        + ["pending_approval"] * 10
        + ["rolled_back"] * 8
        + ["failed"] * 7
        + ["rejected"] * 10
        + ["in_progress"] * 10
    )

    deployer = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"

    rows: list[dict] = []
    for i in range(220):
        day_offset = rng.randint(0, 29)
        h = rng.randint(0, 23)
        m = rng.randint(0, 59)
        created = (now - timedelta(days=day_offset)).replace(
            hour=h,
            minute=m,
            second=rng.randint(0, 59),
            microsecond=0,
        )
        duration = rng.randint(12, 9000)
        updated = created + timedelta(seconds=duration)
        st = rng.choice(statuses)
        dk = f"seed-{created.strftime('%Y%m%d')}-{uuid.uuid4().hex[:10]}"
        score = random_scorecard()
        tx = (
            "".join(rng.choices("0123456789abcdef", k=64))
            if st in ("succeeded", "pending_approval", "rolled_back")
            else None
        )
        ledger = rng.randint(1_000_000, 9_999_999) if tx else None
        rows.append(
            {
                "id": uuid.uuid4(),
                "repo": rng.choice(REPOS),
                "commit_sha": random_sha(),
                "deployment_key": dk,
                "branch": rng.choice(BRANCHES),
                "environment": "testnet",
                "deployer": deployer,
                "status": st,
                "scorecard_json": score,
                "tx_hash": tx,
                "stellar_ledger": ledger,
                "created_at": created,
                "updated_at": updated,
            },
        )

    with engine.begin() as conn:
        conn.execute(text("DELETE FROM rollback_events"))
        conn.execute(text("DELETE FROM approvals"))
        conn.execute(text("DELETE FROM deployments"))

        ins = text(
            """
            INSERT INTO deployments (
              id, repo, commit_sha, deployment_key, branch, environment,
              deployer, status, scorecard_json, tx_hash, stellar_ledger,
              created_at, updated_at
            ) VALUES (
              :id, :repo, :commit_sha, :deployment_key, :branch, :environment,
              :deployer, :status, CAST(:scorecard_json AS JSONB), :tx_hash, :stellar_ledger,
              :created_at, :updated_at
            )
            """
        )
        for r in rows:
            conn.execute(
                ins,
                {
                    **r,
                    "scorecard_json": json.dumps(r["scorecard_json"]),
                },
            )

        # Re-fetch ids for child tables
        res = conn.execute(text("SELECT id, deployment_key, status FROM deployments"))
        dep_rows = list(res.mappings())

        for d in dep_rows:
            if d["status"] == "pending_approval" and rng.random() < 0.4:
                for _ in range(rng.randint(1, 2)):
                    conn.execute(
                        text(
                            """
                            INSERT INTO approvals (id, deployment_id, approver_address, tx_hash, approved_at)
                            VALUES (:id, :deployment_id, :approver, :tx, :approved_at)
                            """
                        ),
                        {
                            "id": uuid.uuid4(),
                            "deployment_id": d["id"],
                            "approver": f"G{''.join(rng.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', k=55))}",
                            "tx": "".join(rng.choices("0123456789abcdef", k=64)),
                            "approved_at": datetime.now(timezone.utc),
                        },
                    )
            if d["status"] == "rolled_back":
                conn.execute(
                    text(
                        """
                        INSERT INTO rollback_events (
                          id, deployment_id, trigger_type, metrics_json, tx_hash, rolled_back_at
                        ) VALUES (
                          :id, :deployment_id, :trigger, CAST(:metrics AS JSONB), :tx, :at
                        )
                        """
                    ),
                    {
                        "id": uuid.uuid4(),
                        "deployment_id": d["id"],
                        "trigger": rng.choice(["AUTO", "MANUAL"]),
                        "metrics": '{"error_rate": 18, "latency_ms": 2400, "crash_count": 1}',
                        "tx": "".join(rng.choices("0123456789abcdef", k=64)),
                        "at": datetime.now(timezone.utc),
                    },
                )

    print(f"Seeded {len(rows)} deployments (+ approvals / rollbacks where applicable).")
    print(f"DATABASE_URL (sync driver): {url.split('@')[-1]}")


if __name__ == "__main__":
    main()
