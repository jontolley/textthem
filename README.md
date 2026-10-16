# text-them

Group SMS broadcast app. People opt in to a group by texting its **keyword** to a
shared Twilio number; admins manage groups and send broadcasts from a web
dashboard. Built as an npm-workspaces monorepo.

| Part              | Stack                                                    | Hosting          |
| ----------------- | -------------------------------------------------------- | ---------------- |
| `apps/web`        | React + TypeScript + Vite + Tailwind + shadcn/ui + Clerk | Cloudflare Pages |
| `apps/api`        | Node + TypeScript + Fastify + MongoDB driver             | Fly.io           |
| `packages/shared` | Shared TypeScript types                                  | —                |
| Database          | MongoDB                                                  | MongoDB Atlas    |
| SMS               | Twilio (Messaging Service)                               | —                |

## How it works

- Each **group** has a unique alphanumeric keyword (e.g. `DRAGON`).
- Inbound SMS to the Twilio number hits `POST /api/twilio/inbound`:
  - `STOP`/`UNSUBSCRIBE`/etc → unsubscribe from all groups
  - `HELP`/`INFO` → reply with org info
  - a group keyword → subscribe (creates the member if new)
  - anything else → friendly "unknown keyword" reply
- Admins (authenticated via Clerk) create groups and broadcast to subscribed
  members via a Twilio Messaging Service.

## Prerequisites

- Node 22+
- Docker (for local MongoDB)
- A Twilio account with a phone number (a Messaging Service is optional — see below)
- A Clerk application (publishable + secret keys)

## Local development

```bash
npm install
cp .env.example .env        # fill in Twilio + Clerk values

# Start MongoDB (and optionally the API) in Docker:
docker compose up -d mongo  # just Mongo; run the API on the host for fast reload
# or: docker compose up      # Mongo + API together
# or: docker compose --profile tools up mongo-express   # DB UI on :8081

# Run the API (host) and web app in separate terminals:
npm run build --workspace @text-them/shared   # build shared types once
npm run dev:api    # http://localhost:8080
npm run dev:web    # http://localhost:5173
```

A single root `.env` serves both apps: `npm run dev:api` loads it via
`node --env-file`, and Vite reads it from the repo root (`envDir`), exposing only
`VITE_`-prefixed vars to the browser. The database name is `textthem`
(`MONGODB_DB_NAME`) in both local and production.

### Receiving SMS locally

Twilio must reach your local API over the public internet. Start a tunnel and
point the number's "A message comes in" webhook at it:

```bash
# e.g. with ngrok
ngrok http 8080
# Set the Twilio number webhook to: https://<tunnel>/api/twilio/inbound
# and set PUBLIC_BASE_URL=https://<tunnel> so signature validation matches.
```

For quick local testing without a tunnel you can set
`TWILIO_SKIP_SIGNATURE_VALIDATION=true` (never in production).

## Scripts

```bash
npm run build        # build all workspaces
npm test             # run api tests (in-memory Mongo)
npm run typecheck    # typecheck all workspaces
npm run format       # prettier
```

### Operational scripts

One-off scripts in `apps/api/scripts/`, run from the repo root with an env file
that holds the needed secrets:

```bash
node --env-file=.env --import tsx apps/api/scripts/<script>.ts
```

| Script                    | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `send-test-broadcast.ts`  | Send a live test SMS                                     |
| `check-message-status.ts` | Look up delivery status by message SID                   |
| `check-a2p-status.ts`     | A2P 10DLC readiness: sender pool, campaign, brand status |
| `check-mongo.ts`          | Validate a connection string and scoped-user access      |

## Deployment

### Backend → Fly.io

```bash
fly launch --no-deploy --copy-config --config apps/api/fly.toml
fly secrets set \
  MONGODB_URI="<atlas-srv-uri>" \
  TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... \
  TWILIO_FROM_NUMBER="+1555..." `# or TWILIO_MESSAGING_SERVICE_SID=MG... (takes precedence)` \
  PUBLIC_BASE_URL="https://textthem-api.fly.dev" \
  CLERK_SECRET_KEY=... CLERK_PUBLISHABLE_KEY=... \
  CORS_ORIGINS="https://<your-pages-domain>" ORG_NAME="Your Org"
# Deploy from the repo root (monorepo build context):
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile .
```

CI auto-deploys on push to `main` when `FLY_API_TOKEN` is set as a repo secret
(see `.github/workflows/deploy-api.yml`).

### Frontend → Cloudflare Pages

Connect the GitHub repo in the Cloudflare Pages dashboard:

- **Build command:** `npm run build:web` (builds shared, then web)
- **Build output directory:** `apps/web/dist`
- **Root directory:** `/`
- **Environment variables:** `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`
  (`https://textthem-api.fly.dev`)

Node is pinned via `.nvmrc`.

Pages redeploys on every push to `main`. SPA routing is handled by
`apps/web/public/_redirects`.

### Database → MongoDB Atlas

Create a cluster, add a database user with `readWrite` on the `textthem`
database, allow Fly.io egress (`0.0.0.0/0` on the free tier), and use the SRV
connection string as `MONGODB_URI`. Verify it with `check-mongo.ts`.

### Twilio

Point the phone number's inbound webhook ("A message comes in") at
`https://textthem-api.fly.dev/api/twilio/inbound` (HTTP POST).

For outbound, set `TWILIO_FROM_NUMBER` to that number to get started. When you
scale up (or need US A2P 10DLC registration), create a Messaging Service, add the
number to its sender pool, and set `TWILIO_MESSAGING_SERVICE_SID` instead — it
takes precedence with no code change.

US A2P 10DLC: until a Brand and Campaign are registered on the Messaging Service,
outbound SMS returns Twilio error **30034** (undelivered) even though the API
call succeeds. Check readiness with `check-a2p-status.ts`.
