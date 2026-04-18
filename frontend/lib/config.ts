import type { StellarNetworkId } from "@/lib/stellar";

function normalizeWsBase(httpBase: string): string {
  const u = new URL(httpBase);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.origin;
}

/** Network the app expects for Freighter / signing (default: testnet). */
function parseWalletTargetNetwork(): StellarNetworkId {
  const raw = process.env.NEXT_PUBLIC_WALLET_NETWORK?.trim().toLowerCase();
  if (raw === "mainnet" || raw === "futurenet" || raw === "testnet") return raw;
  return "testnet";
}

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

/** Base URL for REST + Socket.IO (same host as API). */
export const API_BASE_URL = apiUrl;

/** WebSocket URL for native WS if used elsewhere. */
export const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL?.replace(/\/$/, "") ?? normalizeWsBase(apiUrl);

export const MULTISIG_CONTRACT_ID =
  process.env.NEXT_PUBLIC_MULTISIG_CONTRACT_ID?.trim() ?? "";

export const DEPLOYMENT_DECISION_CONTRACT_ID =
  process.env.NEXT_PUBLIC_DEPLOYMENT_DECISION_CONTRACT_ID?.trim() ?? "";

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL?.replace(/\/$/, "") ?? "";

export const WALLET_TARGET_NETWORK = parseWalletTargetNetwork();
