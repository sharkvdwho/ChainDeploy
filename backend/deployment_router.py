"""Deployment REST + live WebSocket for ChainDeploy."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from stellar_sdk.keypair import Keypair

from config import Settings, get_settings
from db import get_db
from deployment_schemas import (
    ApproveDeploymentRequest,
    ApproveDeploymentResponse,
    DeploymentDetailResponse,
    DeploymentHistoryItem,
    DeploymentHistoryResponse,
    EvaluateDeploymentResponse,
    LegacyDeploymentRead,
    RollbackDeploymentRequest,
    RollbackDeploymentResponse,
    ApprovalRecordOut,
    RollbackRecordOut,
)
from github_service import parse_github_webhook, verify_webhook_signature
from history_cache import history_cache_get, history_cache_invalidate, history_cache_set
from models import Approval, Deployment, DeploymentStatus, RollbackEvent
from stellar_service import get_stellar_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/deployments", tags=["deployments"])


def _derive_decision(
    test_coverage: int,
    error_rate_delta: int,
    performance_score: int,
    security_scan_passed: bool,
    coverage_threshold: int = 80,
) -> tuple[str, str | None]:
    """Mirror Soroban DeploymentDecision gate logic (see contracts/deployment_decision)."""
    reasons: list[str] = []
    if test_coverage < coverage_threshold:
        reasons.append("test_coverage below threshold")
    if error_rate_delta > 5:
        reasons.append("error_rate_delta above 5")
    if performance_score < 70:
        reasons.append("performance_score below 70")
    if not security_scan_passed:
        reasons.append("security_scan_passed is false")
    if not reasons:
        return "APPROVED", None
    return "PENDING_APPROVAL", "; ".join(reasons)


def _dashboard_url(settings: Settings, deployment_uuid: str) -> str:
    return f"{settings.dashboard_base_url}/?deployment={deployment_uuid}"

# --- Live WebSocket registry (module scope) ---
_live_connections: set[WebSocket] = set()
_event_poll_state: dict[str, Any] = {
    "cursors": {},  # contract_id -> cursor
    "start_ledger": {},
    "seen_ids": set(),
}


async def broadcast_live(message: dict[str, Any]) -> None:
    dead: list[WebSocket] = []
    for ws in _live_connections:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _live_connections.discard(ws)


async def _soroban_poll_loop() -> None:
    """Background task: poll Soroban getEvents for configured contracts; push to WS clients."""
    settings = get_settings()
    stellar = get_stellar_service()
    cids = [
        c
        for c in (
            settings.deployment_decision_contract_id,
            settings.multisig_approval_contract_id,
            settings.rollback_engine_contract_id,
        )
        if c
    ]
    if not cids:
        return
    while True:
        try:
            await asyncio.sleep(settings.soroban_poll_interval_sec)
            for cid in cids:
                cur = _event_poll_state["cursors"].get(cid)
                sl = _event_poll_state["start_ledger"].get(cid)
                seen: set[str] = _event_poll_state["seen_ids"]
                fresh, next_c, used_sl = await asyncio.to_thread(
                    stellar.fetch_new_contract_events,
                    cid,
                    cur,
                    sl,
                    seen,
                )
                if used_sl is not None:
                    _event_poll_state["start_ledger"][cid] = used_sl
                if next_c:
                    _event_poll_state["cursors"][cid] = next_c
                for ev in fresh:
                    await broadcast_live({"type": "soroban_event", "data": ev})
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Soroban poller iteration failed")


_poller_task: asyncio.Task | None = None


def start_event_poller() -> None:
    global _poller_task
    if _poller_task is None or _poller_task.done():
        _poller_task = asyncio.create_task(_soroban_poll_loop())


def _extract_deployer_secret(data: dict[str, Any]) -> str:
    nested = data.get("chaindeploy") or {}
    sec = (
        data.get("deployer_secret")
        or data.get("deployerSecret")
        or nested.get("deployer_secret")
        or os.getenv("CHAIN_DEPLOY_DEFAULT_DEPLOYER_SECRET", "")
    )
    if not sec:
        raise HTTPException(
            status_code=422,
            detail="Missing deployer_secret (or chaindeploy.deployer_secret, or CHAIN_DEPLOY_DEFAULT_DEPLOYER_SECRET).",
        )
    return str(sec)


@router.post("/evaluate", response_model=EvaluateDeploymentResponse)
async def evaluate_deployment(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> EvaluateDeploymentResponse:
    """
    Accepts a GitHub Actions-style JSON payload (or compatible dict), extracts CI metrics,
    signs and submits `DeploymentDecision::evaluate`, and caches the row locally.
    """
    settings = get_settings()
    body_bytes = await request.body()
    try:
        data = json.loads(body_bytes.decode("utf-8"))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}") from e

    auth = request.headers.get("Authorization")
    if settings.ci_webhook_token:
        if auth != f"Bearer {settings.ci_webhook_token}":
            raise HTTPException(status_code=401, detail="Invalid ChainDeploy API token")

    sig = request.headers.get("X-Hub-Signature-256") or request.headers.get(
        "X-Hub-Signature",
    )
    if settings.github_webhook_secret:
        if not sig:
            logger.warning(
                "POST /evaluate rejected: GITHUB_WEBHOOK_SECRET is set but "
                "X-Hub-Signature-256 / X-Hub-Signature header is missing",
            )
            raise HTTPException(
                status_code=401,
                detail="GitHub webhook signature required (X-Hub-Signature-256)",
            )
        if not verify_webhook_signature(
            body_bytes,
            sig,
            settings.github_webhook_secret,
        ):
            logger.warning(
                "POST /evaluate rejected: GitHub HMAC signature mismatch "
                "(wrong GITHUB_WEBHOOK_SECRET or payload altered)",
            )
            raise HTTPException(
                status_code=401,
                detail="Invalid GitHub webhook signature",
            )

    parsed = parse_github_webhook(data)
    repo = parsed.get("repo_full_name") or data.get("repository", {}).get("full_name")
    commit = parsed.get("commit_sha") or data.get("after") or data.get("sha")
    branch = parsed.get("branch") or data.get("ref", "").replace("refs/heads/", "") or "main"
    dep_name = parsed.get("deployment_id") or data.get("deployment_id") or (repo or "unknown")

    tc = parsed.get("test_coverage")
    er = parsed.get("error_rate_delta")
    ps = parsed.get("performance_score")
    sec = parsed.get("security_scan_passed")

    if tc is None or er is None or ps is None or sec is None:
        raise HTTPException(
            status_code=422,
            detail="Missing scorecard fields in payload (test_coverage, error_rate_delta, performance_score, security_scan_passed). "
            "Provide them under workflow inputs / client_payload / chaindeploy.",
        )

    dkey = str(dep_name)
    secret = _extract_deployer_secret(data)
    kp = Keypair.from_secret(secret)

    cov_th = int(data.get("coverage_threshold") or 80)
    decision, rejection_reason = _derive_decision(
        int(tc), int(er), int(ps), bool(sec), coverage_threshold=cov_th,
    )

    stellar = get_stellar_service()
    tx_hash: str | None = None
    ledger: int | None = None
    try:
        tx_hash, ledger = stellar.submit_deployment_scorecard(
            dkey,
            int(tc),
            int(er),
            int(ps),
            bool(sec),
            kp,
        )
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Soroban submit failed: {e!s}",
        ) from e

    from datetime import datetime, timezone

    ts = datetime.now(timezone.utc)
    env_label = str(data.get("environment") or "testnet")
    status_val = (
        DeploymentStatus.SUCCEEDED.value
        if decision == "APPROVED"
        else DeploymentStatus.PENDING_APPROVAL.value
    )
    row = Deployment(
        repo=repo or "unknown/unknown",
        commit_sha=commit or "unknown",
        deployment_key=dkey,
        branch=branch,
        environment=env_label,
        deployer=kp.public_key,
        status=status_val,
        scorecard_json={
            "test_coverage": tc,
            "error_rate_delta": er,
            "performance_score": ps,
            "security_scan_passed": sec,
            "decision": decision,
            "rejection_reason": rejection_reason,
        },
        tx_hash=tx_hash,
        stellar_ledger=ledger,
        created_at=ts,
        updated_at=ts,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    history_cache_invalidate()

    await broadcast_live(
        {
            "type": "evaluate",
            "deployment_id": str(row.id),
            "tx_hash": tx_hash,
            "decision": decision,
        },
    )

    return EvaluateDeploymentResponse(
        deployment_id=dkey,
        deployment_uuid=row.id,
        decision=decision,  # type: ignore[arg-type]
        approved=decision == "APPROVED",
        tx_hash=tx_hash,
        stellar_ledger=ledger,
        message="Scorecard recorded on-chain.",
        rejection_reason=rejection_reason,
        dashboard_url=_dashboard_url(settings, str(row.id)),
    )


@router.post("/{deployment_id}/approve", response_model=ApproveDeploymentResponse)
async def approve_deployment(
    deployment_id: UUID,
    body: ApproveDeploymentRequest,
    db: AsyncSession = Depends(get_db),
) -> ApproveDeploymentResponse:
    result = await db.execute(select(Deployment).where(Deployment.id == deployment_id))
    dep = result.scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=404, detail="Deployment not found")

    sk = body.approver_secret.get_secret_value()
    kp = Keypair.from_secret(sk)
    stellar = get_stellar_service()
    try:
        tx_hash, ledger = stellar.submit_approval(dep.deployment_key, kp)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    appr = Approval(
        deployment_id=dep.id,
        approver_address=kp.public_key,
        tx_hash=tx_hash,
    )
    db.add(appr)
    await db.commit()
    history_cache_invalidate()

    cnt = await db.scalar(
        select(func.count()).select_from(Approval).where(Approval.deployment_id == dep.id),
    )
    await broadcast_live(
        {
            "type": "approval",
            "deployment_id": str(dep.id),
            "tx_hash": tx_hash,
        },
    )

    return ApproveDeploymentResponse(
        deployment_id=str(dep.id),
        approval_count=int(cnt or 0),
        tx_hash=tx_hash,
        stellar_ledger=ledger,
    )


@router.post("/{deployment_id}/rollback", response_model=RollbackDeploymentResponse)
async def rollback_deployment(
    deployment_id: UUID,
    body: RollbackDeploymentRequest,
    db: AsyncSession = Depends(get_db),
) -> RollbackDeploymentResponse:
    result = await db.execute(select(Deployment).where(Deployment.id == deployment_id))
    dep = result.scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=404, detail="Deployment not found")

    sk = body.initiator_secret.get_secret_value()
    kp = Keypair.from_secret(sk)
    metrics = body.metrics.model_dump()
    stellar = get_stellar_service()
    try:
        tx_hash, ledger = stellar.trigger_rollback(
            dep.deployment_key,
            metrics,
            body.triggered_by,
            kp,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    rb = RollbackEvent(
        deployment_id=dep.id,
        trigger_type=body.triggered_by,
        metrics_json=metrics,
        tx_hash=tx_hash,
    )
    dep.status = DeploymentStatus.ROLLED_BACK.value
    db.add(rb)
    await db.commit()
    history_cache_invalidate()

    await broadcast_live(
        {
            "type": "rollback",
            "deployment_id": str(dep.id),
            "tx_hash": tx_hash,
        },
    )

    return RollbackDeploymentResponse(
        deployment_id=str(dep.id),
        tx_hash=tx_hash,
        stellar_ledger=ledger,
    )


@router.get("", response_model=list[LegacyDeploymentRead])
async def list_deployments_legacy(
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
) -> list[LegacyDeploymentRead]:
    """Backward-compatible listing for dashboards (`name` = deployment_key)."""
    result = await db.execute(
        select(Deployment).order_by(Deployment.updated_at.desc()).limit(limit),
    )
    rows = result.scalars().all()
    return [
        LegacyDeploymentRead(
            id=r.id,
            name=r.deployment_key,
            status=r.status,
            environment=r.environment,
            updated_at=r.updated_at,
        )
        for r in rows
    ]


@router.get("/history", response_model=DeploymentHistoryResponse)
async def deployment_history(
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
) -> DeploymentHistoryResponse:
    settings = get_settings()
    ttl = settings.deployment_history_cache_ttl_sec
    cache_key = f"chaindeploy:history:{limit}"
    if ttl > 0:
        cached = history_cache_get(cache_key)
        if cached is not None:
            return DeploymentHistoryResponse.model_validate(cached)

    stellar = get_stellar_service()
    stellar_rows = stellar.get_deployment_history(limit=limit)

    result = await db.execute(
        select(Deployment)
        .options(selectinload(Deployment.approvals))
        .order_by(Deployment.updated_at.desc())
        .limit(limit),
    )
    rows = result.scalars().unique().all()
    items: list[DeploymentHistoryItem] = []
    for r in rows:
        items.append(
            DeploymentHistoryItem(
                id=r.id,
                deployment_key=r.deployment_key,
                repo=r.repo,
                commit_sha=r.commit_sha,
                branch=r.branch,
                environment=r.environment,
                deployer=r.deployer,
                status=r.status,
                scorecard_json=r.scorecard_json,
                tx_hash=r.tx_hash,
                stellar_ledger=r.stellar_ledger,
                created_at=r.created_at,
                updated_at=r.updated_at,
                approvals_count=len(r.approvals),
                stellar_transactions_sample=stellar_rows[:5],
            ),
        )
    out = DeploymentHistoryResponse(items=items, stellar_recent=stellar_rows)
    if ttl > 0:
        history_cache_set(cache_key, out.model_dump(mode="json"), ttl)
    return out


@router.get("/{deployment_id}", response_model=DeploymentDetailResponse)
async def get_deployment_detail(
    deployment_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> DeploymentDetailResponse:
    result = await db.execute(
        select(Deployment)
        .where(Deployment.id == deployment_id)
        .options(
            selectinload(Deployment.approvals),
            selectinload(Deployment.rollback_events),
        ),
    )
    dep = result.scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=404, detail="Deployment not found")

    base = DeploymentHistoryItem(
        id=dep.id,
        deployment_key=dep.deployment_key,
        repo=dep.repo,
        commit_sha=dep.commit_sha,
        branch=dep.branch,
        environment=dep.environment,
        deployer=dep.deployer,
        status=dep.status,
        scorecard_json=dep.scorecard_json,
        tx_hash=dep.tx_hash,
        stellar_ledger=dep.stellar_ledger,
        created_at=dep.created_at,
        updated_at=dep.updated_at,
        approvals_count=len(dep.approvals),
    )
    approvals = [ApprovalRecordOut.model_validate(a) for a in dep.approvals]
    rollbacks = [RollbackRecordOut.model_validate(r) for r in dep.rollback_events]

    on_chain: list[dict[str, Any]] = []
    settings = get_settings()
    stellar = get_stellar_service()
    for cid in (
        settings.deployment_decision_contract_id,
        settings.multisig_approval_contract_id,
        settings.rollback_engine_contract_id,
    ):
        if not cid:
            continue
        try:
            local_seen: set[str] = set()
            evs, _, _ = stellar.fetch_new_contract_events(cid, None, None, local_seen)
            on_chain.extend(evs[:10])
        except Exception as e:
            logger.debug("Event sample failed: %s", e)

    return DeploymentDetailResponse(
        deployment=base,
        approvals=approvals,
        rollbacks=rollbacks,
        on_chain_events=on_chain,
    )


async def deployments_live_websocket(websocket: WebSocket) -> None:
    """WebSocket `/ws/deployments/live` — streams Soroban poll + server events."""
    await websocket.accept()
    _live_connections.add(websocket)
    start_event_poller()
    try:
        await websocket.send_json(
            {
                "type": "hello",
                "message": "Subscribed to ChainDeploy live channel",
            },
        )
        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    finally:
        _live_connections.discard(websocket)
