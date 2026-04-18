"""Pydantic models for deployment API (evaluate / approve / rollback / history)."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr


class GitHubWebhookHeaders(BaseModel):
    """Optional metadata when forwarding GitHub delivery ids."""

    x_github_delivery: str | None = Field(default=None, alias="X-GitHub-Delivery")
    x_github_event: str | None = Field(default=None, alias="X-GitHub-Event")


class EvaluateDeploymentRequest(BaseModel):
    """Normalized payload for POST /api/deployments/evaluate (after webhook parse)."""

    deployment_id: str = Field(..., min_length=1, max_length=256)
    repo: str = Field(..., description="owner/name")
    commit_sha: str = Field(..., min_length=7, max_length=64)
    branch: str = Field(default="main", max_length=256)
    test_coverage: int = Field(..., ge=0, le=100)
    error_rate_delta: int = Field(..., ge=-100, le=100)
    performance_score: int = Field(..., ge=0, le=100)
    security_scan_passed: bool
    deployer_secret: SecretStr = Field(
        ...,
        description="Stellar secret key (S…) used to sign the Soroban transaction.",
    )


class EvaluateDeploymentResponse(BaseModel):
    deployment_id: str
    deployment_uuid: UUID
    decision: Literal["APPROVED", "REJECTED", "PENDING_APPROVAL"]
    approved: bool | None = None
    tx_hash: str | None = None
    stellar_ledger: int | None = None
    message: str = ""
    rejection_reason: str | None = None
    dashboard_url: str = ""


class ApproveDeploymentRequest(BaseModel):
    approver_secret: SecretStr = Field(
        ...,
        description="Approver Stellar secret key to sign MultiSigApproval::approve.",
    )


class ApproveDeploymentResponse(BaseModel):
    deployment_id: str
    approval_count: int
    tx_hash: str | None = None
    stellar_ledger: int | None = None


class RollbackMetrics(BaseModel):
    error_rate: int = Field(default=0, ge=0)
    latency_ms: int = Field(default=0, ge=0)
    crash_count: int = Field(default=0, ge=0)


class RollbackDeploymentRequest(BaseModel):
    metrics: RollbackMetrics = Field(default_factory=RollbackMetrics)
    triggered_by: str = Field(..., pattern="^(AUTO|MANUAL)$")
    initiator_secret: SecretStr = Field(
        ...,
        description="Stellar secret key for the initiator account signing rollback.",
    )


class RollbackDeploymentResponse(BaseModel):
    deployment_id: str
    status: str = "rolled_back"
    tx_hash: str | None = None
    stellar_ledger: int | None = None


class DeploymentHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    deployment_key: str = ""
    repo: str
    commit_sha: str
    branch: str
    environment: str = "testnet"
    deployer: str
    status: str
    scorecard_json: dict[str, Any] | None = None
    tx_hash: str | None = None
    stellar_ledger: int | None = None
    created_at: datetime
    updated_at: datetime
    approvals_count: int = 0
    stellar_transactions_sample: list[dict[str, Any]] = Field(default_factory=list)


class LegacyDeploymentRead(BaseModel):
    """Shape expected by older ChainDeploy dashboard clients."""

    id: UUID
    name: str
    status: str
    environment: str
    updated_at: datetime | None = None


class DeploymentHistoryResponse(BaseModel):
    items: list[DeploymentHistoryItem]
    stellar_recent: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Recent Horizon rows for configured contract ids.",
    )


class ApprovalRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    approver_address: str
    tx_hash: str | None
    approved_at: datetime


class RollbackRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    trigger_type: str
    metrics_json: dict[str, Any] | None
    tx_hash: str | None
    rolled_back_at: datetime


class DeploymentDetailResponse(BaseModel):
    deployment: DeploymentHistoryItem
    approvals: list[ApprovalRecordOut]
    rollbacks: list[RollbackRecordOut]
    on_chain_events: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Soroban getEvents sample for related contracts (best-effort).",
    )
