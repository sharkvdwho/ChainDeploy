#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${INPUT_API_BASE_URL%/}"
EVENT="${INPUT_EVENT:?event is required}"
NAME="${INPUT_DEPLOYMENT_NAME:?deployment_name is required}"
ENVIRONMENT="${INPUT_ENVIRONMENT:-testnet}"
GIT_SHA="${INPUT_GIT_SHA:-}"
TOKEN="${INPUT_TOKEN:-}"

BODY=$(jq -nc \
  --arg event "$EVENT" \
  --arg name "$NAME" \
  --arg env "$ENVIRONMENT" \
  --arg sha "$GIT_SHA" \
  '{event: $event, deployment_name: $name, environment: $env, git_sha: $sha}')

TMPHDR=$(mktemp)
trap 'rm -f "$TMPHDR"' EXIT
printf '%s\n' "Content-Type: application/json" >"$TMPHDR"
if [[ -n "$TOKEN" ]]; then
  printf '%s\n' "Authorization: Bearer ${TOKEN}" >>"$TMPHDR"
fi

STATUS=$(curl -sS -o /tmp/chaindeploy_body.json -w '%{http_code}' \
  -X POST "${API_BASE_URL}/api/ci/events" \
  -H @"$TMPHDR" \
  -d "$BODY" || true)

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "http_status=$STATUS" >>"$GITHUB_OUTPUT"
fi
if [[ "$STATUS" != "200" && "$STATUS" != "201" && "$STATUS" != "204" ]]; then
  echo "ChainDeploy API returned HTTP $STATUS" >&2
  if [[ -f /tmp/chaindeploy_body.json ]]; then
    cat /tmp/chaindeploy_body.json >&2 || true
  fi
  exit 1
fi
