"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchDeploymentDetail,
  fetchDeploymentHistory,
  fetchHealth,
  type DeploymentHistoryResponse,
  type DeploymentDetailResponse,
  type HealthResponse,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useHealthQuery() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => fetchHealth(),
    staleTime: 30_000,
  });
}

export function useDeploymentsHistoryQuery(limit = 200) {
  return useQuery({
    queryKey: queryKeys.deploymentsHistory(limit),
    queryFn: () => fetchDeploymentHistory(limit),
    staleTime: 30_000,
  });
}

export function useDeploymentDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.deploymentDetail(id ?? ""),
    queryFn: () => fetchDeploymentDetail(id!),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

export function useInvalidateDeployments() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["deployments"] });
  };
}

export type { DeploymentHistoryResponse, DeploymentDetailResponse, HealthResponse };
