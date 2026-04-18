import { DataProvider } from "@stellar/wallet-sdk";
import { HORIZON_HTTP_URL, passphraseFor, type StellarNetworkId } from "./stellar";

/**
 * Read-only account view (balances, payments) via the Stellar Wallet SDK
 * {@link DataProvider}, aligned with the active ChainDeploy network.
 */
export function createAccountDataProvider(
  network: StellarNetworkId,
  accountOrKey: string,
): DataProvider {
  return new DataProvider({
    serverUrl: HORIZON_HTTP_URL[network],
    accountOrKey,
    networkPassphrase: passphraseFor(network),
    metadata: {
      allowHttp: network !== "mainnet",
      appName: "ChainDeploy",
      appVersion: "0.1.0",
    },
  });
}
