"use client";

/**
 * Best-effort detection of Freighter (browser extension).
 * Freighter injects an API; we also try the official helper when available.
 */
export async function detectFreighterInstalled(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const mod = await import("@stellar/freighter-api");
    const res = await mod.isConnected();
    if (typeof res.isConnected === "boolean") return true;
    return true;
  } catch {
    return typeof window !== "undefined" && "stellar" in window;
  }
}

export const FREIGHTER_INSTALL_URL =
  "https://chrome.google.com/webstore/detail/freighter/bcacfldlkkdogcmhmibhnkhtmojevehj";
