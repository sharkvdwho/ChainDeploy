import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import {
  fetchDeploymentHistory,
  fetchDeploymentDetail,
  type DeploymentHistoryItem,
} from "@/lib/api";
import type { StellarNetworkId } from "@/lib/stellar";

export type { StellarNetworkId };

export type Deployment = DeploymentHistoryItem;

export type ToastItem = {
  id: string;
  title: string;
  message?: string;
  variant: "info" | "success" | "error";
};

type DeploymentState = {
  deployments: Deployment[];
  activeDeployment: Deployment | null;
  walletAddress: string | null;
  stellarNetwork: StellarNetworkId;
  isConnected: boolean;
  xlmBalance: string | null;
  apiStellarNetwork: string | null;
  loading: boolean;
  error: string | null;
  toasts: ToastItem[];

  fetchDeployments: () => Promise<void>;
  setActiveDeployment: (d: Deployment | null) => void;
  loadDeploymentById: (id: string) => Promise<Deployment | null>;
  connectWallet: (address: string | null, network: StellarNetworkId) => void;
  setWalletBalance: (balance: string | null) => void;
  setApiStellarNetwork: (n: string | null) => void;
  addLiveDeployment: (d: Partial<Deployment> & { id: string }) => void;
  updateDeploymentStatus: (id: string, patch: Partial<Deployment>) => void;
  pushToast: (t: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
};

let toastSeq = 0;

export const useDeploymentStore = create<DeploymentState>()(
  persist(
    (set, get) => ({
      deployments: [],
      activeDeployment: null,
      walletAddress: null,
      stellarNetwork: "testnet",
      isConnected: false,
      xlmBalance: null,
      apiStellarNetwork: null,
      loading: false,
      error: null,
      toasts: [],

      fetchDeployments: async () => {
        set({ loading: true, error: null });
        try {
          const res = await fetchDeploymentHistory(200);
          set({ deployments: res.items, loading: false });
        } catch (e) {
          set({
            error: e instanceof Error ? e.message : "Failed to load deployments",
            loading: false,
          });
        }
      },

      setActiveDeployment: (d) => set({ activeDeployment: d }),

      loadDeploymentById: async (id) => {
        try {
          const detail = await fetchDeploymentDetail(id);
          const d = detail.deployment;
          set({ activeDeployment: d });
          get().updateDeploymentStatus(id, d);
          return d;
        } catch {
          return null;
        }
      },

      connectWallet: (address, network) =>
        set({
          walletAddress: address,
          isConnected: Boolean(address),
          stellarNetwork: network,
        }),

      setWalletBalance: (balance) => set({ xlmBalance: balance }),

      setApiStellarNetwork: (n) => set({ apiStellarNetwork: n }),

      addLiveDeployment: (partial) =>
        set((state) => {
          const next = [...state.deployments];
          const idx = next.findIndex((x) => x.id === partial.id);
          const merged = idx >= 0 ? { ...next[idx], ...partial } : (partial as Deployment);
          if (idx >= 0) next[idx] = merged as Deployment;
          else next.unshift(merged as Deployment);
          return { deployments: next };
        }),

      updateDeploymentStatus: (id, patch) =>
        set((state) => ({
          deployments: state.deployments.map((d) =>
            d.id === id ? { ...d, ...patch } : d,
          ),
          activeDeployment:
            state.activeDeployment?.id === id
              ? { ...state.activeDeployment, ...patch }
              : state.activeDeployment,
        })),

      pushToast: (t) => {
        const id = `toast-${++toastSeq}-${Date.now()}`;
        set((s) => ({
          toasts: [...s.toasts, { ...t, id }],
        }));
        setTimeout(() => {
          get().dismissToast(id);
        }, 6500);
      },

      dismissToast: (id) =>
        set((s) => ({
          toasts: s.toasts.filter((x) => x.id !== id),
        })),
    }),
    {
      name: "chaindeploy-wallet",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        walletAddress: s.walletAddress,
        stellarNetwork: s.stellarNetwork,
        isConnected: Boolean(s.walletAddress),
      }),
    },
  ),
);
