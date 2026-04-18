"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

import { API_BASE_URL } from "@/lib/config";
import { useUiStore } from "@/store/ui-store";
import { useDeploymentStore } from "@/store/deploymentStore";

/**
 * Socket.IO — deployment:update with aggressive reconnect (exponential backoff).
 */
export function useDeploymentSocket(enabled: boolean) {
  const socketRef = useRef<Socket | null>(null);
  const setSocketState = useUiStore((s) => s.setSocketState);
  const setLastDeploymentEvent = useUiStore((s) => s.setLastDeploymentEvent);
  const pushToast = useDeploymentStore((s) => s.pushToast);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    setSocketState("connecting");
    const socket = io(API_BASE_URL, {
      path: "/socket.io",
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 60_000,
      randomizationFactor: 0.5,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketState("connected");
    });

    socket.on("connect_error", () => {
      setSocketState("error");
    });

    socket.on("disconnect", () => {
      setSocketState("connecting");
    });

    socket.on(
      "deployment:update",
      (payload: { message: string; deployment_id?: string | null }) => {
        setLastDeploymentEvent(payload.message);
        pushToast({
          variant: "info",
          title: "Deployment channel",
          message: payload.message,
        });
        void queryClient.invalidateQueries({ queryKey: ["deployments"] });
      },
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketState("idle");
    };
  }, [enabled, setLastDeploymentEvent, setSocketState, pushToast, queryClient]);
}
