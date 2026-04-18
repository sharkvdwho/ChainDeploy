"""GitHub Actions webhooks and Commit Status API integration."""

from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Any

import httpx

from config import get_settings

logger = logging.getLogger(__name__)


def parse_github_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Extract ChainDeploy-relevant CI metrics from a GitHub webhook payload.

    Supports `workflow_run` (completed) and a minimal custom `client_payload`
    shape sent from `repository_dispatch` / workflow inputs.
    """
    event_name = payload.get("action") or payload.get("event", "")
    out: dict[str, Any] = {
        "event": event_name,
        "repo_full_name": None,
        "commit_sha": None,
        "branch": None,
        "test_coverage": None,
        "error_rate_delta": None,
        "performance_score": None,
        "security_scan_passed": None,
        "deployment_id": None,
        "raw": {},
    }

    repo = payload.get("repository") or {}
    out["repo_full_name"] = repo.get("full_name")

    wr = payload.get("workflow_run")
    if isinstance(wr, dict):
        out["commit_sha"] = wr.get("head_sha") or wr.get("head_commit", {}).get("id")
        head = wr.get("head_branch")
        if head:
            out["branch"] = head
        # Optional: parse conclusion / outputs if embedded in workflow name
        out["raw"]["workflow_status"] = wr.get("status")
        out["raw"]["conclusion"] = wr.get("conclusion")

    inp = payload.get("inputs") or payload.get("client_payload") or {}
    if isinstance(inp, dict):
        out["test_coverage"] = _to_int(inp.get("test_coverage"))
        out["error_rate_delta"] = _to_int(inp.get("error_rate_delta"))
        out["performance_score"] = _to_int(inp.get("performance_score"))
        sec = inp.get("security_scan_passed")
        if isinstance(sec, bool):
            out["security_scan_passed"] = sec
        elif isinstance(sec, str):
            out["security_scan_passed"] = sec.lower() in ("true", "1", "yes")
        out["deployment_id"] = inp.get("deployment_id") or inp.get("name")

    if payload.get("deployment"):
        dep = payload["deployment"]
        out["deployment_id"] = out["deployment_id"] or dep.get("environment")
        out["commit_sha"] = out["commit_sha"] or dep.get("sha")

    return out


def _to_int(v: Any) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def verify_webhook_signature(payload_body: bytes, signature: str, secret: str) -> bool:
    """
    Validate `X-Hub-Signature-256` (sha256 HMAC) or legacy `X-Hub-Signature` (sha1).
    """
    if not secret:
        logger.warning("GitHub webhook secret not configured; refusing verification.")
        return False
    if not signature:
        return False
    if signature.startswith("sha256="):
        digest = hmac.new(
            secret.encode("utf-8"),
            payload_body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(signature, f"sha256={digest}")
    if signature.startswith("sha1="):
        digest = hmac.new(
            secret.encode("utf-8"),
            payload_body,
            hashlib.sha1,
        ).hexdigest()
        return hmac.compare_digest(signature, f"sha1={digest}")
    return False


def post_deployment_status(
    repo: str,
    commit_sha: str,
    state: str,
    description: str,
    tx_hash: str | None = None,
    *,
    context: str = "continuous-integration/chaindeploy",
    target_url: str | None = None,
) -> dict[str, Any]:
    """
    Create a commit status on GitHub (`POST /repos/{owner}/{repo}/statuses/{sha}`).

    `state` must be one of: error, failure, pending, success.
    """
    settings = get_settings()
    token = settings.github_token.strip()
    if not token:
        raise RuntimeError("GITHUB_TOKEN is not configured.")

    owner, _, name = repo.partition("/")
    if not owner or not name:
        raise ValueError("repo must be 'owner/name'")

    url = f"https://api.github.com/repos/{owner}/{name}/statuses/{commit_sha}"
    desc = description[:140]
    if tx_hash:
        desc = f"{desc} | tx: {tx_hash[:16]}…"

    body: dict[str, Any] = {
        "state": state,
        "description": desc,
        "context": context,
    }
    if target_url:
        body["target_url"] = target_url

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    with httpx.Client(timeout=30.0) as client:
        r = client.post(url, json=body, headers=headers)
        r.raise_for_status()
        return r.json()
