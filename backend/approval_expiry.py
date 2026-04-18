"""Expire stale pending_approval deployments (DB mirror of multisig deadlines)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from config import get_settings
from db import SessionLocal
from models import Deployment, DeploymentStatus

logger = logging.getLogger(__name__)


async def run_approval_expiry_loop(interval_sec: float = 60.0) -> None:
    while True:
        try:
            await asyncio.sleep(interval_sec)
            settings = get_settings()
            minutes = settings.approval_pending_timeout_minutes
            threshold = datetime.now(timezone.utc) - timedelta(minutes=minutes)
            async with SessionLocal() as session:
                result = await session.execute(
                    select(Deployment).where(
                        Deployment.status == DeploymentStatus.PENDING_APPROVAL.value,
                        Deployment.updated_at < threshold,
                    ),
                )
                rows = result.scalars().all()
                for dep in rows:
                    sj = dict(dep.scorecard_json or {})
                    sj["approval_expired"] = True
                    sj["expiry_reason"] = (
                        f"pending_approval_timeout>{minutes}m — no quorum before deadline; "
                        "on-chain session may also be expired."
                    )
                    dep.status = DeploymentStatus.REJECTED.value
                    dep.scorecard_json = sj
                    dep.updated_at = datetime.now(timezone.utc)
                    logger.info(
                        "Expired pending approval deployment id=%s key=%s",
                        dep.id,
                        dep.deployment_key,
                    )
                if rows:
                    await session.commit()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("approval expiry iteration failed")
