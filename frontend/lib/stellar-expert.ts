import type { StellarNetworkId } from "@/lib/stellar";

export function stellarExpertTxUrl(network: StellarNetworkId, txHash: string): string {
  const slug = network === "mainnet" ? "public" : network === "futurenet" ? "futurenet" : "testnet";
  return `https://stellar.expert/explorer/${slug}/tx/${txHash}`;
}

export function stellarExpertAccountUrl(network: StellarNetworkId, address: string): string {
  const slug = network === "mainnet" ? "public" : network === "futurenet" ? "futurenet" : "testnet";
  return `https://stellar.expert/explorer/${slug}/account/${address}`;
}

/** Map API health `stellar_network` string to dashboard network id */
export function apiNetworkToId(api: string | null | undefined): StellarNetworkId {
  const s = (api ?? "testnet").toLowerCase();
  if (s.includes("main") || s === "public") return "mainnet";
  return "testnet";
}
