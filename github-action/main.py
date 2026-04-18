#!/usr/bin/env python3
"""
ChainDeploy GitHub Action entrypoint.
Collects CI metrics, calls POST /api/deployments/evaluate, updates commit status & PR comment.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import httpx
from stellar_sdk.keypair import Keypair

# ---------------------------------------------------------------------------
# GitHub Actions I/O
# ---------------------------------------------------------------------------


def _gha_set_output(name: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        print(f"::notice::{name}={value}")
        return
    with open(path, "a", encoding="utf-8") as fh:
        if "\n" in value:
            fh.write(f"{name}<<EOF\n{value}\nEOF\n")
        else:
            fh.write(f"{name}={value}\n")


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _fail(msg: str, code: int = 1) -> None:
    print(f"::error::{msg}", file=sys.stderr)
    sys.exit(code)


# ---------------------------------------------------------------------------
# Metric collectors
# ---------------------------------------------------------------------------


def _find_file(glob_pat: str) -> Path | None:
    root = Path(_env("GITHUB_WORKSPACE", "."))
    if "*" in glob_pat or "?" in glob_pat:
        for p in root.rglob(glob_pat.replace("**/", "")):
            if p.is_file():
                return p
        return None
    p = root / glob_pat
    return p if p.is_file() else None


def parse_coverage_percent(glob_default: str) -> float:
    """Parse pytest/coverage.xml, lcov, or jest coverage-summary.json."""
    workspace = Path(_env("GITHUB_WORKSPACE", "."))

    # Jest: coverage/coverage-summary.json
    jest = workspace / "coverage" / "coverage-summary.json"
    if jest.is_file():
        data = json.loads(jest.read_text(encoding="utf-8"))
        total = data.get("total") or {}
        pct = total.get("lines", {}).get("pct")
        if pct is not None:
            return float(pct)

    cov_path = _find_file(glob_default) or _find_file("**/coverage.xml")
    if cov_path and cov_path.suffix.lower() == ".xml":
        tree = ET.parse(cov_path)
        root = tree.getroot()
        # Cobertura: line-rate on root or packages
        lr = root.get("line-rate")
        if lr:
            return float(lr) * 100.0
        for pkg in root.iter("package"):
            lr = pkg.get("line-rate")
            if lr:
                return float(lr) * 100.0

    lcov = _find_file("**/lcov.info") or workspace / "lcov.info"
    if lcov and lcov.is_file():
        text = lcov.read_text(encoding="utf-8", errors="ignore")
        m = re.search(r"LF:(\d+)\s*\nLH:(\d+)", text)
        if m:
            lf, lh = int(m.group(1)), int(m.group(2))
            if lf > 0:
                return 100.0 * lh / lf

    raise RuntimeError(
        "Could not find coverage data (coverage.xml, lcov.info, or coverage/coverage-summary.json). "
        "Run pytest --cov / jest --coverage first.",
    )


def parse_security_scan_passed(workspace: Path) -> bool:
    """Bandit JSON (no HIGH) or Snyk code JSON; if absent, pass with warning."""
    bandit = workspace / "bandit-report.json"
    if bandit.is_file():
        data = json.loads(bandit.read_text(encoding="utf-8"))
        for r in data.get("results", []):
            if r.get("issue_severity") == "HIGH":
                return False
        return True

    for name in ("snyk-code.json", "snyk.json", ".snyk-code-analysis.json"):
        p = workspace / name
        if p.is_file():
            raw = p.read_text(encoding="utf-8", errors="ignore")
            if "error" in raw.lower() and "high" in raw.lower():
                return False
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict) and data.get("vulnerabilities"):
                for v in data["vulnerabilities"]:
                    if str(v.get("severity", "")).upper() == "HIGH":
                        return False
            return True

    print("::warning::No Bandit/Snyk artifact found; treating security_scan_passed=true")
    return True


def probe_performance_score(probe_url: str | None, fallback_url: str) -> int:
    """Map latency to 0–100 (higher is better)."""
    url = (probe_url or "").strip() or fallback_url
    try:
        t0 = time.monotonic()
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read(256)
        ms = (time.monotonic() - t0) * 1000.0
    except (urllib.error.URLError, OSError) as e:
        print(f"::warning::Performance probe failed ({e}); scoring 50")
        return 50
    if ms <= 50:
        return 100
    if ms <= 200:
        return 95
    if ms <= 500:
        return 85
    if ms <= 2000:
        return 75
    return max(40, int(100 - ms / 100))


def fetch_previous_error_rate_delta(api_base: str, repo: str, branch: str, token: str) -> int:
    """Compare latest deployment error_rate_delta in history (rough trend)."""
    headers = {"Authorization": f"Bearer {token}"}
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.get(f"{api_base.rstrip('/')}/api/deployments/history", headers=headers)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        print(f"::warning::Could not load deployment history for error-rate trend: {e}")
        return 0

    items = data.get("items") if isinstance(data, dict) else None
    if not items:
        return 0

    prev: list[dict[str, Any]] = []
    for it in items:
        if it.get("repo") == repo and it.get("branch") == branch:
            prev.append(it)
    if not prev:
        return 0
    prev.sort(key=lambda x: str(x.get("updated_at", "")), reverse=True)
    sc = prev[0].get("scorecard_json") or {}
    try:
        return int(sc.get("error_rate_delta", 0))
    except (TypeError, ValueError):
        return 0


# ---------------------------------------------------------------------------
# GitHub API
# ---------------------------------------------------------------------------


def github_post_status(
    token: str,
    repo_full: str,
    sha: str,
    state: str,
    description: str,
    target_url: str | None = None,
) -> None:
    owner, _, name = repo_full.partition("/")
    if not owner or not name:
        raise ValueError("GITHUB_REPOSITORY must be owner/name")
    url = f"https://api.github.com/repos/{owner}/{name}/statuses/{sha}"
    body: dict[str, Any] = {
        "state": state,
        "description": description[:140],
        "context": "chaindeploy/scorecard",
    }
    if target_url:
        body["target_url"] = target_url[:512]
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        resp.read()


def github_pr_comment(
    token: str,
    repo_full: str,
    pr_number: int,
    body_md: str,
) -> None:
    owner, _, name = repo_full.partition("/")
    url = f"https://api.github.com/repos/{owner}/{name}/issues/{pr_number}/comments"
    req = urllib.request.Request(
        url,
        data=json.dumps({"body": body_md}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        resp.read()


def load_event() -> dict[str, Any]:
    path = _env("GITHUB_EVENT_PATH")
    if not path or not Path(path).is_file():
        return {}
    return json.loads(Path(path).read_text(encoding="utf-8"))


def resolve_pr_number(event: dict[str, Any]) -> int | None:
    pr = event.get("pull_request") or event.get("inputs") or {}
    num = pr.get("number")
    if isinstance(num, int):
        return num
    # workflow_dispatch
    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    api = _env("INPUT_CHAINDEPLOY_API_URL")
    deployer_pub = _env("INPUT_DEPLOYER_STELLAR_ADDRESS")
    deployer_sec = _env("INPUT_DEPLOYER_STELLAR_SECRET")
    chain_secret = _env("INPUT_CHAINDEPLOY_SECRET")
    cov_threshold = int(_env("INPUT_TEST_COVERAGE_THRESHOLD", "80") or "80")
    auto_rb = _env("INPUT_AUTO_ROLLBACK_ENABLED", "true").lower() in ("1", "true", "yes")
    perf_probe = _env("INPUT_PERFORMANCE_PROBE_URL")
    cov_glob = _env("INPUT_COVERAGE_FILE_GLOB", "coverage.xml")

    gh_token = _env("GITHUB_TOKEN")
    repo = _env("GITHUB_REPOSITORY")
    sha = _env("GITHUB_SHA")
    ref = _env("GITHUB_REF", "refs/heads/main")
    branch = ref.replace("refs/heads/", "") if ref.startswith("refs/heads/") else ref
    workspace = Path(_env("GITHUB_WORKSPACE", "."))

    if not api or not deployer_pub or not deployer_sec or not chain_secret:
        _fail("Missing required inputs (API URL, deployer address/secret, chaindeploy secret).")

    try:
        kp = Keypair.from_secret(deployer_sec)
    except Exception as e:
        _fail(f"Invalid deployer_stellar_secret: {e}")

    if kp.public_key != deployer_pub:
        _fail(
            f"deployer_stellar_address ({deployer_pub}) does not match secret (expects {kp.public_key})",
        )

    # 1) Metrics
    try:
        coverage_pct = parse_coverage_percent(cov_glob)
    except Exception as e:
        _fail(str(e))

    sec_ok = parse_security_scan_passed(workspace)
    health_url = f"{api.rstrip('/')}/health"
    perf_score = probe_performance_score(perf_probe or None, health_url)

    _ = fetch_previous_error_rate_delta(api, repo, branch, chain_secret)
    # CI cannot observe live prod error rate here; use 0 delta (stable). Extend with your metrics exporter if needed.
    error_rate_delta = 0

    event = load_event()
    deployment_key = f"{repo}@{sha[:7]}"

    payload: dict[str, Any] = {
        "repository": {"full_name": repo},
        "sha": sha,
        "ref": ref,
        "deployment_id": deployment_key,
        "workflow_run": {"head_sha": sha, "head_branch": branch},
        "test_coverage": int(round(coverage_pct)),
        "error_rate_delta": error_rate_delta,
        "performance_score": perf_score,
        "security_scan_passed": sec_ok,
        "deployer_secret": deployer_sec,
        "environment": "testnet",
        "coverage_threshold": cov_threshold,
        "auto_rollback_enabled": auto_rb,
        "chaindeploy": {
            "deployer_secret": deployer_sec,
        },
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {chain_secret}",
    }

    # 2) Submit scorecard
    try:
        with httpx.Client(timeout=120.0) as client:
            r = client.post(
                f"{api.rstrip('/')}/api/deployments/evaluate",
                json=payload,
                headers=headers,
            )
    except httpx.HTTPError as e:
        _fail(f"HTTP error calling ChainDeploy: {e}")

    try:
        body = r.json()
    except json.JSONDecodeError:
        body = {}

    if r.status_code >= 400:
        raw_detail = body.get("detail") if isinstance(body, dict) else r.text
        if isinstance(raw_detail, dict):
            msg = raw_detail.get("error") or json.dumps(raw_detail)
        else:
            msg = raw_detail
        if gh_token and sha:
            try:
                github_post_status(
                    gh_token,
                    repo,
                    sha,
                    "failure",
                    f"ChainDeploy error: {str(msg)[:100]}",
                )
            except Exception:
                pass
        _fail(f"ChainDeploy API error {r.status_code}: {msg}", code=1)

    decision = str(body.get("decision", "APPROVED")).upper()
    dep_uuid = str(body.get("deployment_uuid", ""))
    tx_hash = str(body.get("tx_hash") or body.get("stellar_tx_hash") or "")
    dashboard = str(body.get("dashboard_url") or f"{api.rstrip('/')}/")

    _gha_set_output("deployment_id", dep_uuid)
    _gha_set_output("decision", decision)
    _gha_set_output("stellar_tx_hash", tx_hash)
    _gha_set_output("dashboard_url", dashboard)

    # Markdown table for PR
    table = (
        "| Metric | Value |\n| --- | --- |\n"
        f"| Test coverage | {coverage_pct:.1f}% (threshold {cov_threshold}%) |\n"
        f"| Error rate delta | {error_rate_delta} |\n"
        f"| Performance score | {perf_score} |\n"
        f"| Security scan | {'PASS' if sec_ok else 'FAIL'} |\n"
        f"| Decision | **{decision}** |\n"
        f"| Stellar tx | `{tx_hash or 'n/a'}` |\n"
        f"| Dashboard | {dashboard} |\n"
    )

    # 3) Decision handling + GitHub
    pr_num = resolve_pr_number(event)

    if decision == "APPROVED":
        print(f"ChainDeploy APPROVED. Stellar tx: {tx_hash}")
        if gh_token and sha:
            github_post_status(
                gh_token,
                repo,
                sha,
                "success",
                "ChainDeploy: scorecard APPROVED",
                target_url=dashboard,
            )
        if gh_token and pr_num:
            try:
                github_pr_comment(
                    gh_token,
                    repo,
                    pr_num,
                    "## ChainDeploy\n\n" + table,
                )
            except Exception as e:
                print(f"::warning::PR comment failed: {e}")
        sys.exit(0)

    if decision == "REJECTED":
        reason = body.get("rejection_reason") or body.get("detail") or "rejected"
        print(f"ChainDeploy REJECTED: {reason} tx={tx_hash}", file=sys.stderr)
        if gh_token and sha:
            github_post_status(
                gh_token,
                repo,
                sha,
                "failure",
                f"ChainDeploy: {str(reason)[:120]}",
                target_url=dashboard,
            )
        if gh_token and pr_num:
            try:
                github_pr_comment(
                    gh_token,
                    repo,
                    pr_num,
                    "## ChainDeploy — REJECTED\n\n" + table + f"\nReason: {reason}\n",
                )
            except Exception as e:
                print(f"::warning::PR comment failed: {e}")
        sys.exit(1)

    # PENDING_APPROVAL — pending status + poll deployment detail
    print(f"ChainDeploy PENDING_APPROVAL (multisig). tx={tx_hash}")
    if gh_token and sha:
        github_post_status(
            gh_token,
            repo,
            sha,
            "pending",
            "ChainDeploy: awaiting multi-sig approval",
            target_url=dashboard,
        )
    if gh_token and pr_num:
        try:
            github_pr_comment(
                gh_token,
                repo,
                pr_num,
                "## ChainDeploy — PENDING APPROVAL\n\n"
                + table
                + "\n> Approvers must sign on-chain or update deployment status in ChainDeploy.\n",
            )
        except Exception as e:
            print(f"::warning::PR comment failed: {e}")

    deadline = time.monotonic() + 600.0
    poll_interval = 30.0
    final_status: str | None = None
    while time.monotonic() < deadline:
        time.sleep(poll_interval)
        try:
            with httpx.Client(timeout=30.0) as client:
                rr = client.get(
                    f"{api.rstrip('/')}/api/deployments/{dep_uuid}",
                    headers=headers,
                )
            if rr.status_code != 200:
                continue
            detail = rr.json()
            dep = detail.get("deployment") or {}
            st = str(dep.get("status", "")).lower()
            approvals = detail.get("approvals") or []
            if st in ("succeeded", "rolled_back", "failed", "rejected"):
                final_status = st
                break
        except Exception as e:
            print(f"::warning::poll: {e}")

    if final_status == "succeeded":
        if gh_token and sha:
            github_post_status(gh_token, repo, sha, "success", "ChainDeploy: approved", dashboard)
        sys.exit(0)
    if final_status in ("failed", "rejected", "rolled_back"):
        if gh_token and sha:
            github_post_status(gh_token, repo, sha, "failure", f"ChainDeploy: {final_status}", dashboard)
        sys.exit(1)

    print("::error::Timed out waiting for ChainDeploy approval (10 minutes)", file=sys.stderr)
    if gh_token and sha:
        github_post_status(
            gh_token,
            repo,
            sha,
            "failure",
            "ChainDeploy: approval timeout",
            dashboard,
        )
    sys.exit(1)


if __name__ == "__main__":
    main()
