from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class DeploymentStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"
    REJECTED = "rejected"
    PENDING_APPROVAL = "pending_approval"


class RollbackTriggerType(StrEnum):
    AUTO = "AUTO"
    MANUAL = "MANUAL"


class Deployment(Base):
    """Cached deployment row mirrored from CI + on-chain activity."""

    __tablename__ = "deployments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    repo: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    commit_sha: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    """Logical id shared with Soroban contracts (workflow / stack name)."""
    deployment_key: Mapped[str] = mapped_column(String(256), nullable=False, unique=True, index=True)
    branch: Mapped[str] = mapped_column(String(256), nullable=False, default="main")
    environment: Mapped[str] = mapped_column(String(128), nullable=False, default="testnet", index=True)
    deployer: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        default="",
        doc="Stellar strkey (G…) or service label.",
    )
    status: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    scorecard_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    tx_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    stellar_ledger: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    approvals: Mapped[list["Approval"]] = relationship(
        "Approval",
        back_populates="deployment",
        cascade="all, delete-orphan",
    )
    rollback_events: Mapped[list["RollbackEvent"]] = relationship(
        "RollbackEvent",
        back_populates="deployment",
        cascade="all, delete-orphan",
    )


class Approval(Base):
    """On-chain approval vote (multi-sig) linked to a deployment."""

    __tablename__ = "approvals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    deployment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("deployments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    approver_address: Mapped[str] = mapped_column(String(128), nullable=False)
    tx_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    approved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    deployment: Mapped["Deployment"] = relationship(
        "Deployment",
        back_populates="approvals",
    )


class RollbackEvent(Base):
    """Recorded rollback invocation (AUTO/MANUAL)."""

    __tablename__ = "rollback_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    deployment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("deployments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    trigger_type: Mapped[str] = mapped_column(String(32), nullable=False)
    metrics_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    tx_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    rolled_back_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    deployment: Mapped["Deployment"] = relationship(
        "Deployment",
        back_populates="rollback_events",
    )
