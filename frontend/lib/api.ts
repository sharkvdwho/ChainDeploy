import axios, { type AxiosInstance } from "axios";
import { API_BASE_URL } from "./config";

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: {
    "Content-Type": "application/json",
  },
});

export type HealthResponse = {
  status: string;
  service: string;
  stellar_network: string;
  libs?: Record<string, string>;
};

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>("/health");
  return data;
}

export type DeploymentSummary = {
  id: string;
  name: string;
  status: string;
  environment: string;
  updated_at: string | null;
};

export async function listDeployments(): Promise<DeploymentSummary[]> {
  const { data } = await api.get<DeploymentSummary[]>("/api/deployments");
  return data;
}

export type DeploymentHistoryItem = {
  id: string;
  deployment_key: string;
  repo: string;
  commit_sha: string;
  branch: string;
  environment: string;
  deployer: string;
  status: string;
  scorecard_json: Record<string, unknown> | null;
  tx_hash: string | null;
  stellar_ledger: number | null;
  created_at: string;
  updated_at: string;
  approvals_count: number;
  stellar_transactions_sample: Record<string, unknown>[];
};

export type DeploymentHistoryResponse = {
  items: DeploymentHistoryItem[];
  stellar_recent: Record<string, unknown>[];
};

export async function fetchDeploymentHistory(
  limit = 100,
): Promise<DeploymentHistoryResponse> {
  const { data } = await api.get<DeploymentHistoryResponse>("/api/deployments/history", {
    params: { limit },
  });
  return data;
}

export type ApprovalRecordOut = {
  id: string;
  approver_address: string;
  tx_hash: string | null;
  approved_at: string;
};

export type RollbackRecordOut = {
  id: string;
  trigger_type: string;
  metrics_json: Record<string, unknown> | null;
  tx_hash: string | null;
  rolled_back_at: string;
};

export type DeploymentDetailResponse = {
  deployment: DeploymentHistoryItem;
  approvals: ApprovalRecordOut[];
  rollbacks: RollbackRecordOut[];
  on_chain_events: Record<string, unknown>[];
};

export async function fetchDeploymentDetail(
  deploymentId: string,
): Promise<DeploymentDetailResponse> {
  const { data } = await api.get<DeploymentDetailResponse>(
    `/api/deployments/${deploymentId}`,
  );
  return data;
}
