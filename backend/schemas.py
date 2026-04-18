from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DeploymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    status: str
    environment: str
    updated_at: datetime | None = None


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "chaindeploy-api"
    stellar_network: str = Field(default="testnet")
    libs: dict[str, str] = Field(
        default_factory=dict,
        description="Resolved versions for key runtime dependencies.",
    )


class CiEventIn(BaseModel):
    event: str = Field(
        ...,
        description="One of: deployment_started | deployment_finished | rollback",
    )
    deployment_name: str = Field(..., min_length=1, max_length=256)
    environment: str = Field(default="testnet", max_length=128)
    git_sha: str = Field(default="", max_length=64)


class CiEventOut(BaseModel):
    accepted: bool = True
    deployment_id: UUID
    status: str
