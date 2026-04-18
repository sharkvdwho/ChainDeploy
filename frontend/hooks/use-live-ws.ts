"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { WS_BASE_URL } from "@/lib/config";
import { fetchDeploymentDetail } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useDeploymentStore } from "@/store/deploymentStore";

const MAX_BACKOFF_MS = 60_000;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Native WebSocket `/ws/deployments/live` with exponential backoff reconnect.
 */
export function useLiveDeploymentsWs(enabled: boolean) {
  const queryClient = useQueryClient();
  const pushToast = useDeploymentStore((s) => s.pushToast);
  const updateStatus = useDeploymentStore((s) => s.updateDeploymentStatus);
  const reconnectRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    closedRef.current = false;

    const invalidateDeployments = () => {
      void queryClient.invalidateQueries({ queryKey: ["deployments"] });
    };

    const handleMessage = async (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string) as {
          type?: string;
          deployment_id?: string;
          tx_hash?: string;
          decision?: string;
        };
        const t = msg.type;
        if (t === "hello") return;

        if (t === "evaluate" && msg.deployment_id) {
          pushToast({
            variant: "info",
            title: "Deployment evaluated",
            message: `${msg.decision ?? "update"} · ${msg.deployment_id.slice(0, 8)}…`,
          });
          try {
            const detail = await fetchDeploymentDetail(msg.deployment_id);
            updateStatus(msg.deployment_id, detail.deployment);
            void queryClient.invalidateQueries({
              queryKey: queryKeys.deploymentDetail(msg.deployment_id),
            });
          } catch {
            invalidateDeployments();
          }
          invalidateDeployments();
        } else if (t === "rollback" && msg.deployment_id) {
          pushToast({
            variant: "error",
            title: "Rollback recorded",
            message: msg.deployment_id,
          });
          try {
            const detail = await fetchDeploymentDetail(msg.deployment_id);
            updateStatus(msg.deployment_id, detail.deployment);
            void queryClient.invalidateQueries({
              queryKey: queryKeys.deploymentDetail(msg.deployment_id),
            });
          } catch {
            invalidateDeployments();
          }
          invalidateDeployments();
        } else if (t === "soroban_event") {
          invalidateDeployments();
        } else if (msg.deployment_id) {
          invalidateDeployments();
        }
      } catch {
        /* ignore malformed */
      }
    };

    const connect = () => {
      if (closedRef.current) return;
      const url = `${WS_BASE_URL.replace(/\/$/, "")}/ws/deployments/live`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectRef.current = 0;
      };

      ws.onmessage = (ev) => void handleMessage(ev);

      ws.onerror = () => {
        pushToast({
          variant: "error",
          title: "Live stream error",
          message: "WebSocket interrupted — reconnecting…",
        });
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (closedRef.current) return;
        const n = reconnectRef.current;
        const delay = Math.min(
          MAX_BACKOFF_MS,
          INITIAL_BACKOFF_MS * Math.pow(2, n),
        );
        reconnectRef.current = n + 1;
        timerRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, pushToast, updateStatus, queryClient]);
}
