export const queryKeys = {
  health: ["health"] as const,
  deploymentsHistory: (limit: number) => ["deployments", "history", limit] as const,
  deploymentDetail: (id: string) => ["deployments", "detail", id] as const,
};
