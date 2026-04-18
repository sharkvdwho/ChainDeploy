import { create } from "zustand";

export type ConnectionState = "idle" | "connecting" | "connected" | "error";

type UiState = {
  stellarAddress: string | null;
  setStellarAddress: (addr: string | null) => void;
  socketState: ConnectionState;
  setSocketState: (s: ConnectionState) => void;
  lastDeploymentEvent: string | null;
  setLastDeploymentEvent: (msg: string | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  stellarAddress: null,
  setStellarAddress: (addr) => set({ stellarAddress: addr }),
  socketState: "idle",
  setSocketState: (s) => set({ socketState: s }),
  lastDeploymentEvent: null,
  setLastDeploymentEvent: (msg) => set({ lastDeploymentEvent: msg }),
}));
