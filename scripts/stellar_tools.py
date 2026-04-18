"""
Shared Soroban helpers for ChainDeploy demo scripts (stellar-sdk ContractClient).
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from stellar_sdk import scval
from stellar_sdk.contract import ContractClient
from stellar_sdk.contract.exceptions import SendTransactionFailedError, SimulationFailedError
from stellar_sdk.keypair import Keypair

REPO_ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = REPO_ROOT / "contracts"

DEFAULT_RPC = "https://soroban-testnet.stellar.org"
TESTNET_PASSPHRASE = "Test SDF Network ; September 2015"


def find_stellar_cli() -> str | None:
    return shutil.which("stellar")


def friendbot_fund(public_key: str, network: str = "testnet") -> None:
    import httpx

    if network != "testnet":
        raise ValueError("Friendbot is only for testnet")
    url = f"https://friendbot.stellar.org?addr={public_key}"
    r = httpx.get(url, timeout=60.0)
    if r.status_code >= 400:
        raise RuntimeError(f"Friendbot failed: {r.status_code} {r.text}")


def build_wasm_release() -> None:
    """Build all workspace Soroban WASM artifacts."""
    cmd = [
        "cargo",
        "build",
        "--release",
        "--target",
        "wasm32-unknown-unknown",
        "-p",
        "deployment_decision",
        "-p",
        "multisig_approval",
        "-p",
        "rollback_engine",
    ]
    subprocess.run(cmd, cwd=CONTRACTS, check=True)


def wasm_path(crate: str) -> Path:
    # Workspace root is `contracts/`; Cargo emits WASM under that workspace `target/`.
    return (
        CONTRACTS
        / "target/wasm32-unknown-unknown/release"
        / f"{crate.replace('-', '_')}.wasm"
    )


def deploy_contract(
    *,
    wasm: Path,
    source_secret: str,
    rpc_url: str,
    network_passphrase: str,
    stellar_bin: str,
) -> str:
    """Deploy WASM; return contract id (C…). Requires `stellar` CLI."""
    if not wasm.is_file():
        raise FileNotFoundError(f"Missing WASM (build first): {wasm}")
    cmd = [
        stellar_bin,
        "contract",
        "deploy",
        "--wasm",
        str(wasm),
        "--source",
        source_secret,
        "--rpc-url",
        rpc_url,
        "--network",
        "testnet",
    ]
    proc = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0 and network_passphrase:
        cmd2 = cmd + ["--network-passphrase", network_passphrase]
        proc = subprocess.run(
            cmd2,
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        out = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0:
        raise RuntimeError(f"stellar contract deploy failed:\n{out}")
    # Contract id starts with C, 56 chars
    m = re.search(r"\b(C[A-Z0-9]{55})\b", out)
    if not m:
        m = re.search(r"\b(C[A-Z0-9]{54,56})\b", out)
    if not m:
        raise RuntimeError(f"Could not parse contract id from deploy output:\n{out}")
    return m.group(1)


def _invoke(
    contract_id: str,
    function_name: str,
    parameters: list[Any],
    signer: Keypair,
    *,
    rpc_url: str,
    network_passphrase: str,
) -> tuple[str, int | None]:
    client = ContractClient(contract_id, rpc_url, network_passphrase)
    assembled = client.invoke(
        function_name,
        parameters,
        source=signer.public_key,
        signer=signer,
    )
    try:
        assembled.sign_and_submit(signer)
    except (SimulationFailedError, SendTransactionFailedError) as e:
        raise RuntimeError(str(e)) from e
    send = assembled.send_transaction_response
    if not send or not send.hash:
        raise RuntimeError("Missing transaction hash after submit")
    tx_hash = send.hash
    ledger = None
    gt = assembled.get_transaction_response
    if gt and gt.ledger is not None:
        ledger = int(gt.ledger)
    return tx_hash, ledger


def deployment_decision_init(
    contract_id: str,
    admin_kp: Keypair,
    *,
    rpc_url: str,
    network_passphrase: str,
) -> tuple[str, int | None]:
    return _invoke(
        contract_id,
        "init",
        [scval.to_address(admin_kp.public_key)],
        admin_kp,
        rpc_url=rpc_url,
        network_passphrase=network_passphrase,
    )


def _scval_vec(sc_vals: list[Any]) -> Any:
    if not hasattr(scval, "to_vec"):
        raise RuntimeError(
            "stellar_sdk>=13 is required for scval.to_vec (Soroban Vec). "
            "pip install -r scripts/requirements.txt",
        )
    return scval.to_vec(sc_vals)


def deployment_decision_set_team_approvers(
    contract_id: str,
    admin_kp: Keypair,
    approver_addresses: list[str],
    *,
    rpc_url: str,
    network_passphrase: str,
) -> tuple[str, int | None]:
    vec = _scval_vec([scval.to_address(a) for a in approver_addresses])
    return _invoke(
        contract_id,
        "set_team_approvers",
        [vec],
        admin_kp,
        rpc_url=rpc_url,
        network_passphrase=network_passphrase,
    )


def multisig_create_session(
    contract_id: str,
    deployer_kp: Keypair,
    deployment_id: str,
    required_approvals: int,
    approver_addrs: list[str],
    expiry_ledger: int,
    *,
    rpc_url: str,
    network_passphrase: str,
) -> tuple[str, int | None]:
    """Anyone may call create_session on MultiSigApproval (see contract)."""
    approver_vec = _scval_vec([scval.to_address(a) for a in approver_addrs])
    return _invoke(
        contract_id,
        "create_session",
        [
            scval.to_string(deployment_id),
            scval.to_uint32(required_approvals),
            approver_vec,
            scval.to_uint32(expiry_ledger),
        ],
        deployer_kp,
        rpc_url=rpc_url,
        network_passphrase=network_passphrase,
    )


def check_cli_or_exit() -> str:
    exe = find_stellar_cli()
    if not exe:
        print(
            "ERROR: `stellar` CLI not found. Install Stellar CLI:\n"
            "  https://developers.stellar.org/docs/tools/developer-tools",
            file=sys.stderr,
        )
        sys.exit(2)
    return exe
