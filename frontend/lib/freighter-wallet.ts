import {
  requestAccess,
  getNetworkDetails,
  signTransaction,
} from "@stellar/freighter-api";
import {
  Asset,
  BASE_FEE,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { getHorizonServer, passphraseFor, type StellarNetworkId } from "@/lib/stellar";

export async function freighterConnect(): Promise<{ address: string }> {
  const res = await requestAccess();
  if ("error" in res && res.error) {
    throw new Error(res.error.message ?? "Freighter rejected connection");
  }
  return { address: res.address };
}

export async function freighterNetwork(): Promise<{
  passphrase: string;
  label: string;
}> {
  const d = await getNetworkDetails();
  if ("error" in d && d.error) {
    throw new Error(d.error.message ?? "Could not read Freighter network");
  }
  return {
    passphrase: d.networkPassphrase,
    label: d.network ?? "unknown",
  };
}

export function mapPassphraseToNetworkId(passphrase: string): StellarNetworkId {
  if (passphrase === Networks.PUBLIC) return "mainnet";
  if (passphrase === Networks.TESTNET) return "testnet";
  if (passphrase === Networks.FUTURENET) return "futurenet";
  return "testnet";
}

/**
 * Minimal self-payment + memo so an approver can prove wallet control to an admin off-chain.
 */
export async function signApproverRegistrationMemo(params: {
  network: StellarNetworkId;
  publicKey: string;
}): Promise<{ txHash: string }> {
  const horizon = getHorizonServer(params.network);
  const account = await horizon.loadAccount(params.publicKey);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: passphraseFor(params.network),
  })
    .addOperation(
      Operation.payment({
        destination: params.publicKey,
        asset: Asset.native(),
        amount: "0.0000001",
      }),
    )
    .addMemo(Memo.text("CHAINAPPROVER"))
    .setTimeout(180)
    .build();

  const xdr = tx.toXDR();
  const signed = await signTransaction(xdr, {
    networkPassphrase: passphraseFor(params.network),
    address: params.publicKey,
  });
  if (signed.error) {
    throw new Error(signed.error.message ?? "Signing failed");
  }

  const parsed = TransactionBuilder.fromXDR(
    signed.signedTxXdr,
    passphraseFor(params.network),
  );
  const res = await horizon.submitTransaction(parsed);
  return { txHash: res.hash };
}
