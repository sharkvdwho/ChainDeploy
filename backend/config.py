"""Application configuration loaded from the environment."""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel, Field


class Settings(BaseModel):
    database_url: str = Field(
        description="SQLAlchemy async URL for PostgreSQL.",
    )
    cors_origins: list[str] = Field(
        default_factory=list,
    )
    stellar_network: str = Field(default="testnet")
    deployment_broadcast_interval_sec: float = Field(default=45.0, ge=5.0)
    ci_webhook_token: str | None = Field(
        default=None,
        description="If set, POST /api/ci/events requires Authorization: Bearer <token>.",
    )
    # Stellar / Soroban
    soroban_rpc_url: str = Field(
        default="https://soroban-testnet.stellar.org",
        description="Soroban JSON-RPC endpoint (no trailing slash).",
    )
    horizon_url: str = Field(
        default="https://horizon-testnet.stellar.org",
        description="Horizon REST base URL for transaction history & streaming.",
    )
    network_passphrase: str = Field(
        default="Test SDF Network ; September 2015",
        description="Stellar network passphrase (testnet default).",
    )
    deployment_decision_contract_id: str = Field(
        default="",
        description="C… contract id for DeploymentDecision WASM.",
    )
    multisig_approval_contract_id: str = Field(
        default="",
        description="C… contract id for MultiSigApproval WASM.",
    )
    rollback_engine_contract_id: str = Field(
        default="",
        description="C… contract id for RollbackEngine WASM.",
    )
    # GitHub
    github_webhook_secret: str = Field(
        default="",
        description="HMAC secret for verifying GitHub webhook signatures.",
    )
    github_token: str = Field(
        default="",
        description="PAT for posting commit statuses (repo scope).",
    )
    # Soroban event polling (for live WS + watch_contract_events)
    soroban_poll_interval_sec: float = Field(default=8.0, ge=2.0)
    dashboard_base_url: str = Field(
        default="http://localhost:3000",
        description="Frontend base URL for dashboard links returned by the API.",
    )
    deployment_history_cache_ttl_sec: float = Field(
        default=30.0,
        ge=0.0,
        description="TTL for GET /api/deployments/history in-memory cache.",
    )
    redis_url: str | None = Field(
        default=None,
        description="Optional redis:// URL for shared deployment history cache.",
    )
    approval_pending_timeout_minutes: int = Field(
        default=15,
        ge=1,
        le=10080,
        description="Mark pending_approval deployments as rejected after this idle window.",
    )


_DEFAULT_DB = (
    "postgresql+asyncpg://chaindeploy:chaindeploy@127.0.0.1:5432/chaindeploy"
)


@lru_cache
def get_settings() -> Settings:
    load_dotenv()
    raw_origins = os.getenv("CORS_ORIGINS", "")
    origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
    if not origins:
        origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    raw_ci = os.getenv("CI_WEBHOOK_TOKEN", "").strip()
    passphrase = os.getenv(
        "STELLAR_NETWORK_PASSPHRASE",
        "Test SDF Network ; September 2015",
    )
    return Settings(
        database_url=os.getenv("DATABASE_URL", _DEFAULT_DB),
        cors_origins=origins,
        stellar_network=os.getenv("STELLAR_NETWORK", "testnet"),
        deployment_broadcast_interval_sec=float(
            os.getenv("DEPLOYMENT_BROADCAST_INTERVAL_SEC", "45"),
        ),
        ci_webhook_token=raw_ci or None,
        soroban_rpc_url=os.getenv(
            "SOROBAN_RPC_URL",
            "https://soroban-testnet.stellar.org",
        ),
        horizon_url=os.getenv(
            "HORIZON_URL",
            "https://horizon-testnet.stellar.org",
        ),
        network_passphrase=passphrase,
        deployment_decision_contract_id=os.getenv(
            "DEPLOYMENT_DECISION_CONTRACT_ID", ""
        ),
        multisig_approval_contract_id=os.getenv(
            "MULTISIG_APPROVAL_CONTRACT_ID", ""
        ),
        rollback_engine_contract_id=os.getenv(
            "ROLLBACK_ENGINE_CONTRACT_ID", ""
        ),
        github_webhook_secret=os.getenv("GITHUB_WEBHOOK_SECRET", ""),
        github_token=os.getenv("GITHUB_TOKEN", ""),
        soroban_poll_interval_sec=float(
            os.getenv("SOROBAN_POLL_INTERVAL_SEC", "8"),
        ),
        dashboard_base_url=os.getenv(
            "DASHBOARD_BASE_URL",
            "http://localhost:3000",
        ).rstrip("/"),
        deployment_history_cache_ttl_sec=float(
            os.getenv("DEPLOYMENT_HISTORY_CACHE_TTL_SEC", "30"),
        ),
        redis_url=os.getenv("REDIS_URL", "").strip() or None,
        approval_pending_timeout_minutes=int(
            os.getenv("APPROVAL_PENDING_TIMEOUT_MINUTES", "15"),
        ),
    )
