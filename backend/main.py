from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import socketio
import sqlalchemy as sa
import stellar_sdk
import websockets
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models  # noqa: F401 — register ORM mappings
from approval_expiry import run_approval_expiry_loop
from config import get_settings
from db import Base, SessionLocal, engine, get_db
from history_cache import history_cache_invalidate
from deployment_router import deployments_live_websocket, router as deployment_router
from models import Deployment, DeploymentStatus
from schemas import CiEventIn, CiEventOut, HealthResponse
from stellar_sdk.keypair import Keypair

logger = logging.getLogger(__name__)
settings = get_settings()

ALLOWED_CI_EVENTS = frozenset(
    {"deployment_started", "deployment_finished", "rollback"},
)


def _status_for_ci_event(event: str) -> str:
    if event == "deployment_started":
        return DeploymentStatus.IN_PROGRESS.value
    if event == "deployment_finished":
        return DeploymentStatus.SUCCEEDED.value
    return DeploymentStatus.ROLLED_BACK.value


sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.cors_origins or "*",
    logger=logging.getLogger("socketio.server"),
    engineio_logger=logging.getLogger("engineio.server"),
)


async def _seed_deployments_if_empty(session: AsyncSession) -> None:
    result = await session.execute(select(sa.func.count()).select_from(Deployment))
    count = result.scalar_one()
    if count and count > 0:
        return
    now = datetime.now(timezone.utc)
    rows = [
        Deployment(
            deployment_key="bootstrap-api-gateway",
            repo="chaindeploy/bootstrap",
            commit_sha="0" * 40,
            branch="main",
            environment="testnet",
            deployer="GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
            status=DeploymentStatus.SUCCEEDED.value,
            scorecard_json={"note": "seed row"},
            tx_hash=None,
            stellar_ledger=None,
            created_at=now,
            updated_at=now,
        ),
        Deployment(
            deployment_key="bootstrap-soroban-registry",
            repo="chaindeploy/bootstrap",
            commit_sha="1" * 40,
            branch="main",
            environment="testnet",
            deployer="GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
            status=DeploymentStatus.IN_PROGRESS.value,
            scorecard_json=None,
            tx_hash=None,
            stellar_ledger=None,
            created_at=now,
            updated_at=now,
        ),
    ]
    session.add_all(rows)
    await session.commit()


async def _deployment_broadcaster() -> None:
    n = 0
    while True:
        await asyncio.sleep(settings.deployment_broadcast_interval_sec)
        n += 1
        try:
            await sio.emit(
                "deployment:update",
                {
                    "message": f"Heartbeat {n} — controller idle, awaiting CI hooks.",
                    "deployment_id": None,
                },
            )
        except Exception:
            logger.exception("Socket broadcast failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        await _seed_deployments_if_empty(session)
    broadcaster = asyncio.create_task(_deployment_broadcaster())
    approval_sweeper = asyncio.create_task(run_approval_expiry_loop())
    yield
    approval_sweeper.cancel()
    broadcaster.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await approval_sweeper
    with contextlib.suppress(asyncio.CancelledError):
        await broadcaster
    await engine.dispose()


app = FastAPI(
    title="ChainDeploy API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(deployment_router)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    _ = Keypair.random().public_key
    return HealthResponse(
        status="ok",
        stellar_network=settings.stellar_network,
        libs={
            "stellar_sdk": getattr(stellar_sdk, "__version__", "unknown"),
            "websockets": getattr(websockets, "__version__", "unknown"),
        },
    )


@app.post("/api/ci/events", response_model=CiEventOut, status_code=201)
async def ingest_ci_event(
    body: CiEventIn,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> CiEventOut:
    if settings.ci_webhook_token:
        expected = f"Bearer {settings.ci_webhook_token}"
        if authorization != expected:
            raise HTTPException(status_code=401, detail="Invalid or missing CI token")
    if body.event not in ALLOWED_CI_EVENTS:
        raise HTTPException(
            status_code=422,
            detail=f"event must be one of: {', '.join(sorted(ALLOWED_CI_EVENTS))}",
        )
    status = _status_for_ci_event(body.event)
    notes_extra = f"git_sha={body.git_sha}" if body.git_sha else None
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Deployment)
        .where(
            Deployment.deployment_key == body.deployment_name,
            Deployment.environment == body.environment,
        )
        .limit(1),
    )
    row = result.scalars().first()
    scorecard = {"ci_event": body.event, "notes": notes_extra} if notes_extra else {"ci_event": body.event}
    if row:
        row.status = status
        row.scorecard_json = {**(row.scorecard_json or {}), **scorecard}
        row.updated_at = now
        await db.commit()
        await db.refresh(row)
        history_cache_invalidate()
        dep = row
    else:
        dep = Deployment(
            deployment_key=body.deployment_name,
            repo="unknown/unknown",
            commit_sha=body.git_sha or "unknown",
            branch="main",
            environment=body.environment,
            deployer="",
            status=status,
            scorecard_json=scorecard,
            tx_hash=None,
            stellar_ledger=None,
            created_at=now,
            updated_at=now,
        )
        db.add(dep)
        await db.commit()
        await db.refresh(dep)
        history_cache_invalidate()
    await sio.emit(
        "deployment:update",
        {
            "message": f"CI {body.event}: {body.deployment_name} ({body.environment})",
            "deployment_id": str(dep.id),
        },
    )
    return CiEventOut(deployment_id=dep.id, status=dep.status)


@app.websocket("/ws/deployments")
async def deployments_websocket(ws: WebSocket) -> None:
    await ws.accept()
    try:
        await ws.send_json(
            {
                "type": "hello",
                "message": "Subscribed to deployment stream (legacy)",
                "stellar_network": settings.stellar_network,
            },
        )
        i = 0
        while True:
            await asyncio.sleep(30.0)
            i += 1
            await ws.send_json(
                {
                    "type": "tick",
                    "index": i,
                    "message": "Deployment controller heartbeat",
                },
            )
    except WebSocketDisconnect:
        return


@app.websocket("/ws/deployments/live")
async def deployments_live(ws: WebSocket) -> None:
    await deployments_live_websocket(ws)


@sio.event
async def connect(sid: str, _environ: dict[str, Any]) -> None:
    await sio.emit(
        "deployment:update",
        {
            "message": "Connected to ChainDeploy Socket.IO — listening for CI + Soroban events.",
            "deployment_id": None,
        },
        room=sid,
    )


@sio.event
async def disconnect(sid: str) -> None:
    logger.debug("socket.io disconnect sid=%s", sid)


socket_app = socketio.ASGIApp(sio, app)
