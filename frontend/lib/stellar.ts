import {
  Horizon,
  Networks,
  rpc,
  TransactionBuilder,
  BASE_FEE,
  Operation,
  Asset,
  Keypair,
  Memo,
} from "@stellar/stellar-sdk";

export type StellarNetworkId = "testnet" | "futurenet" | "mainnet";

export const HORIZON_HTTP_URL: Record<StellarNetworkId, string> = {
  testnet: "https://horizon-testnet.stellar.org",
  futurenet: "https://horizon-futurenet.stellar.org",
  mainnet: "https://horizon.stellar.org",
};

const HORIZON = HORIZON_HTTP_URL;

export const SOROBAN_RPC_URLS: Record<StellarNetworkId, string> = {
  testnet: "https://soroban-testnet.stellar.org",
  futurenet: "https://rpc-futurenet.stellar.org",
  mainnet: "https://soroban-mainnet.stellar.org",
};

const SOROBAN_RPC = SOROBAN_RPC_URLS;

export function getHorizonServer(network: StellarNetworkId): Horizon.Server {
  return new Horizon.Server(HORIZON[network], { allowHttp: network !== "mainnet" });
}

export function sorobanRpcHttpUrl(
  network: StellarNetworkId,
  override?: string | null,
): string {
  const o = override?.trim();
  if (o) return o.replace(/\/$/, "");
  return SOROBAN_RPC_URLS[network];
}

export function getSorobanRpcServer(network: StellarNetworkId): rpc.Server {
  return new rpc.Server(SOROBAN_RPC[network], { allowHttp: network !== "mainnet" });
}

export function passphraseFor(network: StellarNetworkId): string {
  switch (network) {
    case "testnet":
      return Networks.TESTNET;
    case "futurenet":
      return Networks.FUTURENET;
    case "mainnet":
      return Networks.PUBLIC;
    default:
      return Networks.TESTNET;
  }
}

/**
 * Builds a payment transaction skeleton for the active network.
 * Callers sign and submit via a connected wallet or custodial key.
 */
export function buildNativePaymentTx(params: {
  network: StellarNetworkId;
  sourceSecret: string;
  destination: string;
  amount: string;
  memo?: string;
}) {
  const { network, sourceSecret, destination, amount, memo } = params;
  const kp = Keypair.fromSecret(sourceSecret);
  const horizon = getHorizonServer(network);
  return horizon
    .loadAccount(kp.publicKey())
    .then((account) => {
      let tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: passphraseFor(network),
      }).addOperation(
        Operation.payment({
          destination,
          asset: Asset.native(),
          amount,
        }),
      );
      if (memo) {
        tx = tx.addMemo(Memo.text(memo));
      }
      return tx.setTimeout(180).build();
    });
}
