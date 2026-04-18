"""Stellar / Soroban bridge: contract invocations, history, and event streaming."""

from __future__ import annotations

import logging
import re
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import httpx
from stellar_sdk import scval
from stellar_sdk.contract import ContractClient
from stellar_sdk.contract.exceptions import (
    SendTransactionFailedError,
    SimulationFailedError,
)
from stellar_sdk.exceptions import NotFoundError
from stellar_sdk.keypair import Keypair
from stellar_sdk.soroban_rpc import EventFilter, EventFilterType
from stellar_sdk.soroban_server import SorobanServer
from stellar_sdk import xdr as stellar_xdr

from config import Settings, get_settings

logger = logging.getLogger(__name__)


def _soroban_error_detail(exc: Exception, *, function_name: str) -> str:
    """Human-readable message including any parsed Soroban / host error codes."""
    raw = str(exc).strip()
    codes: list[str] = []
    for pat in (
        r"ContractError\((\d+)\)",
        r"HostError\((\d+)\)",
        r"error code[:\s]+(\d+)",
        r"#(\d{1,5})\b",
    ):
        codes.extend(re.findall(pat, raw, re.I))
    uniq = []
    for c in codes:
        if c not in uniq:
            uniq.append(c)
    code_part = f" | parsed_codes={uniq}" if uniq else ""
    return f"Soroban invoke '{function_name}' failed: {raw[:900]}{code_part}"


def _is_transient_submit_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    needles = (
        "timeout",
        "timed out",
        "connection reset",
        "connection refused",
        "temporarily",
        "503",
        "502",
        "504",
        "429",
        "rate limit",
        "bad gateway",
        "service unavailable",
    )
    return any(n in msg for n in needles)


@dataclass
class StellarConnection:
    """Holds Soroban + Horizon handles for testnet (or configured network)."""

    settings: Settings
    soroban: SorobanServer = field(init=False)
    horizon_root: str = field(init=False)

    def __post_init__(self) -> None:
        self.soroban = SorobanServer(self.settings.soroban_rpc_url)
        self.horizon_root = self.settings.horizon_url.rstrip("/")


class StellarService:
    """Facade for ChainDeploy Soroban contracts and Horizon queries."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._conn = StellarConnection(settings=self._settings)
        self._network_passphrase = self._settings.network_passphrase

    def connect_to_stellar_testnet(self) -> dict[str, Any]:
        """Verify Soroban RPC + Horizon reachability (initialization probe)."""
        health = self._conn.soroban.get_health()
        out: dict[str, Any] = {
            "soroban_rpc": self._settings.soroban_rpc_url,
            "horizon": self._settings.horizon_url,
            "network": self._settings.stellar_network,
            "soroban_status": health.status if hasattr(health, "status") else str(health),
        }
        try:
            import httpx

            r = httpx.get(f"{self._conn.horizon_root}/", timeout=10.0)
            out["horizon_status"] = r.status_code
            hj = r.json()
            out["horizon_core_version"] = hj.get("core_version")
        except Exception as e:
            logger.warning("Horizon probe failed: %s", e)
            out["horizon_error"] = str(e)
        return out

    def _require_contract(self, cid: str, name: str) -> str:
        if not cid or len(cid) < 10:
            raise ValueError(
                f"Configure {name} contract id (environment / Settings).",
            )
        return cid

    def _invoke(
        self,
        contract_id: str,
        function_name: str,
        parameters: list[stellar_xdr.SCVal],
        signer: Keypair,
    ) -> tuple[str, int | None]:
        """Build simulate/sign/submit pipeline; returns (tx_hash, ledger)."""
        client = ContractClient(
            contract_id,
            self._settings.soroban_rpc_url,
            self._network_passphrase,
        )
        assembled = client.invoke(
            function_name,
            parameters,
            source=signer.public_key,
            signer=signer,
        )
        last_exc: Exception | None = None
        for attempt in range(1, 5):
            try:
                assembled.sign_and_submit(signer)
                last_exc = None
                break
            except (SimulationFailedError, SendTransactionFailedError) as e:
                last_exc = e
                if attempt < 4 and _is_transient_submit_error(e):
                    delay = min(12.0, 1.0 * (2 ** (attempt - 1)))
                    logger.warning(
                        "Soroban submit retry %s/4 for %s: %s",
                        attempt,
                        function_name,
                        e,
                    )
                    time.sleep(delay)
                    continue
                logger.exception("Soroban invoke failed: %s", function_name)
                raise RuntimeError(_soroban_error_detail(e, function_name=function_name)) from e
        if last_exc is not None:
            raise RuntimeError(
                _soroban_error_detail(last_exc, function_name=function_name),
            ) from last_exc
        send = assembled.send_transaction_response
        if not send or not send.hash:
            raise RuntimeError("Missing transaction hash after submit")
        tx_hash = send.hash
        ledger: int | None = None
        gt = assembled.get_transaction_response
        if gt and gt.ledger is not None:
            ledger = int(gt.ledger)
        return tx_hash, ledger

    def submit_deployment_scorecard(
        self,
        deployment_id: str,
        test_coverage: int,
        error_rate_delta: int,
        performance_score: int,
        security_scan_passed: bool,
        deployer_keypair: Keypair,
    ) -> tuple[str, int | None]:
        """Invoke `DeploymentDecision::evaluate` on-chain."""
        cid = self._require_contract(
            self._settings.deployment_decision_contract_id,
            "DEPLOYMENT_DECISION_CONTRACT_ID",
        )
        params = [
            scval.to_uint32(test_coverage),
            scval.to_int32(error_rate_delta),
            scval.to_uint32(performance_score),
            scval.to_bool(security_scan_passed),
            scval.to_string(deployment_id),
            scval.to_address(deployer_keypair.public_key),
        ]
        return self._invoke(cid, "evaluate", params, deployer_keypair)

    def submit_approval(
        self,
        deployment_id: str,
        approver_keypair: Keypair,
    ) -> tuple[str, int | None]:
        """Invoke `MultiSigApproval::approve`."""
        cid = self._require_contract(
            self._settings.multisig_approval_contract_id,
            "MULTISIG_APPROVAL_CONTRACT_ID",
        )
        params = [
            scval.to_string(deployment_id),
            scval.to_address(approver_keypair.public_key),
        ]
        return self._invoke(cid, "approve", params, approver_keypair)

    def trigger_rollback(
        self,
        deployment_id: str,
        metrics: dict[str, int],
        triggered_by: str,
        initiator_keypair: Keypair,
    ) -> tuple[str, int | None]:
        """Invoke `RollbackEngine::process_rollback` (AUTO or MANUAL)."""
        cid = self._require_contract(
            self._settings.rollback_engine_contract_id,
            "ROLLBACK_ENGINE_CONTRACT_ID",
        )
        sym = triggered_by.strip().upper()
        if sym not in {"AUTO", "MANUAL"}:
            raise ValueError("triggered_by must be AUTO or MANUAL")
        params = [
            scval.to_string(deployment_id),
            scval.to_uint32(int(metrics.get("error_rate", 0))),
            scval.to_uint32(int(metrics.get("latency_ms", 0))),
            scval.to_uint32(int(metrics.get("crash_count", 0))),
            scval.to_symbol(sym),
            scval.to_address(initiator_keypair.public_key),
        ]
        return self._invoke(cid, "process_rollback", params, initiator_keypair)

    def get_deployment_history(self, limit: int = 50) -> list[dict[str, Any]]:
        """Aggregate recent contract-related transactions from Horizon for configured contracts."""

        def _fetch_page(url: str, params: dict[str, Any]) -> httpx.Response:
            last: Exception | None = None
            for attempt in range(1, 4):
                try:
                    return httpx.get(url, params=params, timeout=15.0)
                except (httpx.TimeoutException, httpx.ConnectError, httpx.NetworkError) as e:
                    last = e
                    delay = min(8.0, 0.5 * (2 ** (attempt - 1)))
                    logger.warning(
                        "Horizon request retry %s/3 %s: %s",
                        attempt,
                        url,
                        e,
                    )
                    time.sleep(delay)
            logger.warning(
                "Horizon unreachable for deployment history; returning partial/empty: %s",
                last,
            )
            raise last  # type: ignore[misc]

        cids = [
            c
            for c in (
                self._settings.deployment_decision_contract_id,
                self._settings.multisig_approval_contract_id,
                self._settings.rollback_engine_contract_id,
            )
            if c
        ]
        if not cids:
            logger.warning("No contract ids configured; returning empty Stellar history.")
            return []

        out: list[dict[str, Any]] = []
        seen: set[str] = set()
        for cid in cids:
            try:
                url = f"{self._conn.horizon_root}/accounts/{cid}/transactions"
                r = _fetch_page(url, {"limit": min(limit, 50), "order": "desc"})
                r.raise_for_status()
                embedded = r.json().get("_embedded", {})
                for rec in embedded.get("records", []):
                    h = rec.get("hash")
                    if not h or h in seen:
                        continue
                    seen.add(h)
                    out.append(
                        {
                            "hash": h,
                            "ledger": rec.get("ledger_attr") or rec.get("ledger"),
                            "created_at": rec.get("created_at"),
                            "contract_id": cid,
                            "source_account": rec.get("source_account"),
                            "fee_charged": rec.get("fee_charged"),
                        },
                    )
            except Exception as e:
                logger.warning("Horizon fetch failed for %s: %s", cid, e)
        out.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
        return out[:limit]

    def get_transaction_details(self, tx_hash: str) -> dict[str, Any]:
        """Return Horizon transaction JSON + Soroban getTransaction when available."""
        import httpx

        if not tx_hash:
            raise ValueError("tx_hash required")
        with httpx.Client(timeout=20.0) as client:
            hr = client.get(f"{self._conn.horizon_root}/transactions/{tx_hash}")
            if hr.status_code == 404:
                raise NotFoundError(f"Transaction not found: {tx_hash}")
            hr.raise_for_status()
            horizon_tx = hr.json()
        soroban_meta: dict[str, Any] | None = None
        try:
            gt = self._conn.soroban.get_transaction(tx_hash)
            soroban_meta = gt.model_dump(by_alias=True) if hasattr(gt, "model_dump") else {}
        except Exception as e:
            logger.debug("Soroban getTransaction failed (non-fatal): %s", e)
        return {"horizon": horizon_tx, "soroban": soroban_meta}

    def watch_contract_events(
        self,
        contract_id: str,
        callback: Callable[[dict[str, Any]], None],
        poll_interval_sec: float | None = None,
        stop_event: threading.Event | None = None,
    ) -> None:
        """
        Poll Soroban `getEvents` for a contract (Horizon does not stream Soroban events natively).
        Invokes `callback` with each new event payload. Blocks the calling thread until `stop_event`.
        """
        interval = poll_interval_sec or self._settings.soroban_poll_interval_sec
        ev_stop = stop_event or threading.Event()
        cursor: str | None = None
        seen: set[str] = set()
        start_ledger: int | None = None
        while not ev_stop.is_set():
            try:
                if start_ledger is None and cursor is None:
                    ll = self._conn.soroban.get_latest_ledger()
                    start_ledger = max(1, int(ll.sequence) - 400)
                resp = self._conn.soroban.get_events(
                    start_ledger=start_ledger if cursor is None else None,
                    filters=[
                        EventFilter(
                            event_type=EventFilterType.CONTRACT,
                            contract_ids=[contract_id],
                        ),
                    ],
                    cursor=cursor,
                    limit=50,
                )
                for ev in resp.events:
                    if ev.id in seen:
                        continue
                    seen.add(ev.id)
                    callback(
                        {
                            "id": ev.id,
                            "type": ev.event_type,
                            "ledger": ev.ledger,
                            "contract_id": ev.contract_id,
                            "topic": ev.topic,
                            "value": ev.value,
                            "tx_hash": ev.transaction_hash,
                        },
                    )
                cursor = resp.cursor
            except Exception as e:
                logger.exception("getEvents poll error: %s", e)
            ev_stop.wait(interval)


    def fetch_new_contract_events(
        self,
        contract_id: str,
        cursor: str | None,
        start_ledger: int | None,
        seen_ids: set[str],
    ) -> tuple[list[dict[str, Any]], str | None, int | None]:
        """Single non-blocking poll for getEvents (used by async WS broadcaster)."""
        sl: int | None = start_ledger
        if cursor is None and sl is None:
            ll = self._conn.soroban.get_latest_ledger()
            sl = max(1, int(ll.sequence) - 400)
        resp = self._conn.soroban.get_events(
            start_ledger=sl if cursor is None else None,
            filters=[
                EventFilter(
                    event_type=EventFilterType.CONTRACT,
                    contract_ids=[contract_id],
                ),
            ],
            cursor=cursor,
            limit=50,
        )
        fresh: list[dict[str, Any]] = []
        for ev in resp.events:
            if ev.id in seen_ids:
                continue
            seen_ids.add(ev.id)
            fresh.append(
                {
                    "id": ev.id,
                    "type": ev.event_type,
                    "ledger": ev.ledger,
                    "contract_id": ev.contract_id,
                    "topic": ev.topic,
                    "value": ev.value,
                    "tx_hash": ev.transaction_hash,
                },
            )
        next_cursor = resp.cursor
        return fresh, next_cursor, sl


_service: StellarService | None = None


def get_stellar_service() -> StellarService:
    global _service
    if _service is None:
        _service = StellarService()
    return _service
