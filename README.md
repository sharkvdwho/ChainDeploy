# ChainDeploy

**ChainDeploy** is an autonomous deployment control plane for teams who want **verifiable** release decisions. Every gate—CI metrics, policy outcomes, multisig approvals, and rollbacks—is designed to land on **Stellar** as **Soroban** smart-contract calls, while PostgreSQL and a fast API keep the dashboard snappy. The result is a system that behaves like a normal deploy tool from the outside, but reads like an audit log on the inside: timestamps, actors, and outcomes you can trace from GitHub to ledger.

Judges and operators should read this as: *push code, let CI prove quality, let Soroban enforce policy, and only then touch production*—with rollbacks that are as explicit as deployments. The landing page at `/` explains the story in under a minute; the live dashboard shows deployments, history, and Stellar context in one place.

## The problem

Release pipelines are opaque: a green checkmark in CI does not prove *who* approved a risky deploy, *why* a rollback happened, or that those facts will still exist next quarter. ChainDeploy targets **governance without theater**—automation that writes durable evidence, not screenshots in Slack. Teams need **autonomous** decisions within guardrails, **immutable** history for auditors, and **zero-blame** rollbacks that point to metrics and policy, not individuals.

## Why Stellar + Soroban

- **Deterministic policy on-chain**: DeploymentDecision, multisig approval, and rollback engines can encode thresholds and roles in WASM contracts—same rules for every environment that talks to the same contracts.
- **Cheap, fast testnet iteration**: Soroban on Stellar testnet is ideal for hackathons and demos; contracts and accounts are real on-chain primitives, not mocked database flags.
- **Interoperable audit trail**: Horizon and Stellar Expert let anyone verify hashes and ledgers without trusting ChainDeploy’s UI alone.

## Architecture

```
┌─────────────┐     webhook / REST      ┌──────────────────┐
│   GitHub    │ ───────────────────────▶│  FastAPI         │
│  Actions    │   scorecard + secrets   │  + Socket.IO     │
└─────────────┘                         │  + WebSockets    │
       │                                └────────┬─────────┘
       │                                         │
       │  CI metrics                             │ async SQLAlchemy
       ▼                                         ▼
┌─────────────┐                         ┌──────────────────┐
│  coverage,  │                         │   PostgreSQL      │
│  security,  │                         │  (deployments,   │
│  perf…      │                         │   approvals)     │
└─────────────┘                         └────────┬─────────┘
                                                 │
                    Soroban transactions          │
       ┌─────────────────────────────────────────┼─────────────────────────┐
       ▼                                         ▼                         │
┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐             │
│ Deployment   │   │ MultiSig         │   │ Rollback         │             │
│ Decision     │   │ Approval         │   │ Engine           │             │
│ (WASM)       │   │ (WASM)           │   │ (WASM)           │             │
└──────────────┘   └──────────────────┘   └──────────────────┘             │
       │                     │                       │                      │
       └─────────────────────┴───────────────────────┘                      │
                             Stellar (testnet)                               │
       ┌─────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐     ┌──────────────────┐
│   Horizon    │     │  Next.js UI      │
│  + Soroban   │◀────│  dashboard + /   │
│   RPC        │     │  marketing       │
└──────────────┘     └──────────────────┘
```

## Quick start (three commands)

From the repository root (Docker must be installed):

```bash
cp .env.example .env   # edit DATABASE_URL / contract IDs if needed
docker compose up --build
```

Then open the **frontend** at [http://localhost:3000](http://localhost:3000) and check the **API** at [http://localhost:8000/health](http://localhost:8000/health). For a non-Docker local run, see [Repository layout](#repository-layout) below.

## Integrate into any GitHub repository

1. Copy `example-workflow.yml` to `.github/workflows/chaindeploy.yml` in your app repo.
2. Configure secrets: `CHAINDEPLOY_API_URL`, `CHAIN_DEPLOY_STELLAR_ADDRESS`, `CHAIN_DEPLOY_STELLAR_SECRET`, `CHAINDEPLOY_API_SECRET` (match server `CI_WEBHOOK_TOKEN`).
3. Point `chaindeploy_api_url` at your public ChainDeploy base URL (ngrok or production).

Minimal workflow excerpt (full file: [`example-workflow.yml`](example-workflow.yml)):

```yaml
      - name: ChainDeploy scorecard
        uses: ./github-action
        with:
          chaindeploy_api_url: ${{ secrets.CHAINDEPLOY_API_URL }}
          deployer_stellar_address: ${{ secrets.CHAIN_DEPLOY_STELLAR_ADDRESS }}
          deployer_stellar_secret: ${{ secrets.CHAIN_DEPLOY_STELLAR_SECRET }}
          chaindeploy_secret: ${{ secrets.CHAINDEPLOY_API_SECRET }}
          test_coverage_threshold: "80"
```

Set **`GITHUB_WEBHOOK_SECRET`** on the server to the same secret configured in GitHub’s webhook settings so `POST /api/deployments/evaluate` can verify `X-Hub-Signature-256`.

## Soroban contract addresses (testnet)

After deploying WASM from `contracts/`, set these in `.env` (values are **your** deployed contract IDs):

| Contract            | Environment variable                 |
|---------------------|--------------------------------------|
| Deployment decision | `DEPLOYMENT_DECISION_CONTRACT_ID`    |
| Multisig approval   | `MULTISIG_APPROVAL_CONTRACT_ID`      |
| Rollback engine     | `ROLLBACK_ENGINE_CONTRACT_ID`        |

Browse transactions on [Stellar Expert (testnet)](https://stellar.expert/explorer/testnet).

## Live demo

**Replace with your public URL** when deployed (e.g. ngrok or cloud):

- **App**: `https://YOUR-DEMO-HOST/`
- **API health**: `https://YOUR-DEMO-API-HOST/health` (if the API is on another origin, set `NEXT_PUBLIC_API_URL` accordingly)

## Tech stack

| Layer        | Technology |
|-------------|------------|
| Frontend    | Next.js 14 (App Router), TypeScript, Tailwind CSS, TanStack Query, Recharts, Zustand, Socket.IO client |
| Backend     | FastAPI, SQLAlchemy 2 (async) + asyncpg, python-socketio, Stellar Python SDK |
| Contracts   | Rust, Soroban SDK, WASM (`wasm32v1-none`) |
| Data        | PostgreSQL 16+ |
| Cache (opt) | Redis for shared deployment history cache (`REDIS_URL`) |
| Ops         | Docker Compose |

## Repository layout

| Path | Role |
|------|------|
| `frontend/` | Next.js app: `/` marketing, `/dashboard` app shell |
| `backend/` | FastAPI ASGI app (`main:socket_app`), REST + WebSockets |
| `contracts/` | Soroban workspace: `deployment_decision`, `multisig_approval`, `rollback_engine` |
| `github-action/` | Composite action posting CI payloads to ChainDeploy |
| `docker/` | Dockerfiles; root `docker-compose.yml` runs full stack |

### Local development (without Docker)

**Backend**

```bash
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:socket_app --reload --host 0.0.0.0 --port 8000
```

**Frontend**

```bash
cd frontend && npm install && npm run dev
```

## License

Apache-2.0 (align with Stellar ecosystem norms unless you choose otherwise).
# ChainDeploy

# ScreenShots

<img width="1919" height="1040" alt="image" src="https://github.com/user-attachments/assets/a07ab475-0841-4c5d-bd93-d11d5b2c57c7" />

<img width="1919" height="1039" alt="image" src="https://github.com/user-attachments/assets/d5acb7f4-68d2-4e1e-936e-d1d12cf60c54" />

<img width="1919" height="1038" alt="image" src="https://github.com/user-attachments/assets/36c85352-653b-4f4d-a339-417d0d545a79" />

<img width="1919" height="1039" alt="image" src="https://github.com/user-attachments/assets/58660ae1-c0f0-4b08-aee2-6a8b8bc5767a" />

<img width="1919" height="1038" alt="image" src="https://github.com/user-attachments/assets/12a1e18b-6e83-4577-afa9-1b2c37a44d4b" />

https://www.loom.com/share/19eb9c6fae354004a20eb06aab17deb0
