import { Address, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-base";
import { AssembledTransaction } from "@stellar/stellar-sdk/contract";
import { signTransaction } from "@stellar/freighter-api";

import { DEPLOYMENT_DECISION_CONTRACT_ID, MULTISIG_CONTRACT_ID } from "@/lib/config";
import { passphraseFor, sorobanRpcHttpUrl, type StellarNetworkId } from "@/lib/stellar";

export async function multisigApproveWithFreighter(params: {
  deploymentKey: string;
  publicKey: string;
  network: StellarNetworkId;
  sorobanRpcOverride?: string | null;
}): Promise<{ txHash: string }> {
  const cid = MULTISIG_CONTRACT_ID;
  if (!cid) {
    throw new Error("Set NEXT_PUBLIC_MULTISIG_CONTRACT_ID in the dashboard environment.");
  }
  const rpcUrl = sorobanRpcHttpUrl(params.network, params.sorobanRpcOverride);
  const tx = await AssembledTransaction.build({
    contractId: cid,
    networkPassphrase: passphraseFor(params.network),
    rpcUrl,
    allowHttp: params.network !== "mainnet",
    publicKey: params.publicKey,
    method: "approve",
    args: [
      nativeToScVal(params.deploymentKey, { type: "string" }),
      nativeToScVal(Address.fromString(params.publicKey)),
    ],
    parseResultXdr: (v: xdr.ScVal) => scValToNative(v),
  });

  const sent = await tx.signAndSend({
    signTransaction: async (xdrStr, opts) => {
      const r = await signTransaction(xdrStr, {
        networkPassphrase: opts?.networkPassphrase ?? passphraseFor(params.network),
        address: opts?.address ?? params.publicKey,
      });
      if (r.error) {
        throw new Error(r.error.message ?? "Freighter signing failed");
      }
      return { signedTxXdr: r.signedTxXdr };
    },
  });

  const hash = sent.sendTransactionResponse?.hash;
  if (!hash) {
    throw new Error("Missing transaction hash after submit");
  }
  return { txHash: hash };
}

export type MultisigSessionView = {
  /** Addresses eligible to approve this deployment session */
  eligible: string[];
  /** Distinct addresses that have submitted an approval */
  signed: string[];
  required: number;
  complete: boolean;
  expired: boolean;
} | null;

export async function readMultisigSession(params: {
  deploymentKey: string;
  network: StellarNetworkId;
  sorobanRpcOverride?: string | null;
}): Promise<MultisigSessionView> {
  const cid = MULTISIG_CONTRACT_ID;
  if (!cid) return null;
  const rpcUrl = sorobanRpcHttpUrl(params.network, params.sorobanRpcOverride);
  try {
    const tx = await AssembledTransaction.build({
      contractId: cid,
      networkPassphrase: passphraseFor(params.network),
      rpcUrl,
      allowHttp: params.network !== "mainnet",
      method: "get_session",
      args: [nativeToScVal(params.deploymentKey, { type: "string" })],
      publicKey: undefined,
      parseResultXdr: (v: xdr.ScVal) => scValToNative(v),
    });
    const raw = tx.result as Record<string, unknown> | null | undefined;
    if (!raw || typeof raw !== "object") return null;
    const asList = (v: unknown) =>
      Array.isArray(v) ? v.map((a) => String(a)) : [];
    const eligible = asList(raw.approvers);
    const signed = asList(raw.approvals);
    return {
      eligible,
      signed,
      required: Number(raw.required_approvals ?? 0),
      complete: Boolean(raw.complete),
      expired: Boolean(raw.expired),
    };
  } catch {
    return null;
  }
}

export async function readTeamApprovers(params: {
  network: StellarNetworkId;
  sorobanRpcOverride?: string | null;
}): Promise<string[] | null> {
  const cid = DEPLOYMENT_DECISION_CONTRACT_ID;
  if (!cid) return null;
  const rpcUrl = sorobanRpcHttpUrl(params.network, params.sorobanRpcOverride);
  try {
    const tx = await AssembledTransaction.build({
      contractId: cid,
      networkPassphrase: passphraseFor(params.network),
      rpcUrl,
      allowHttp: params.network !== "mainnet",
      method: "get_team_approvers",
      args: [],
      publicKey: undefined,
      parseResultXdr: (v: xdr.ScVal) => scValToNative(v),
    });
    const raw = tx.result;
    if (Array.isArray(raw)) return raw.map((a) => String(a));
    return [];
  } catch {
    return null;
  }
}
