# text-them

Group SMS broadcast app. People opt in to a group by texting its **keyword** to a
shared Twilio number; admins manage groups and send broadcasts from a web
dashboard. Built as an npm-workspaces monorepo.

| Part | Stack | Hosting |
| --- | --- | --- |
| `apps/web` | React + TypeScript + Vite + Tailwind + shadcn/ui + Clerk | Cloudflare Pages |
| `apps/api` | Node + TypeScript + Fastify + MongoDB driver | Fly.io |
| `packages/shared` | Shared TypeScript types | — |
| Database | MongoDB | MongoDB Atlas |
| SMS | Twilio (Messaging Service) | — |

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

The API reads `.env` from the repo root via your shell environment; export the
vars or use a tool like `dotenv`/`direnv`. The web app reads `VITE_*` vars from
`apps/web/.env` (Vite) — copy the relevant keys there.

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

## Deployment

### Backend → Fly.io

```bash
fly launch --no-deploy --copy-config --config apps/api/fly.toml
fly secrets set \
  MONGODB_URI="<atlas-srv-uri>" \
  TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... \
  TWILIO_FROM_NUMBER="+1555..." `# or TWILIO_MESSAGING_SERVICE_SID=MG... (takes precedence)` \
  PUBLIC_BASE_URL="https://text-them-api.fly.dev" \
  CLERK_SECRET_KEY=... CLERK_PUBLISHABLE_KEY=... \
  CORS_ORIGINS="https://<your-pages-domain>" ORG_NAME="Your Org"
# Deploy from the repo root (monorepo build context):
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile .
```

CI auto-deploys on push to `main` when `FLY_API_TOKEN` is set as a repo secret
(see `.github/workflows/deploy-api.yml`).

### Frontend → Cloudflare Pages

Connect the GitHub repo in the Cloudflare Pages dashboard:

- **Build command:** `npm install && npm run build --workspace @text-them/shared && npm run build --workspace @text-them/web`
- **Build output directory:** `apps/web/dist`
- **Environment variables:** `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`
  (`https://text-them-api.fly.dev`)

Pages redeploys on every push to `main`. SPA routing is handled by
`apps/web/public/_redirects`.

### Database → MongoDB Atlas

Create a cluster, add a database user, allow Fly.io egress IPs (or `0.0.0.0/0`
for a managed test), and use the SRV connection string as `MONGODB_URI`.

### Twilio

Point the phone number's inbound webhook ("A message comes in") at
`https://text-them-api.fly.dev/api/twilio/inbound` (HTTP POST).

For outbound, set `TWILIO_FROM_NUMBER` to that number to get started. When you
scale up (or need US A2P 10DLC registration), create a Messaging Service, add the
number to its sender pool, and set `TWILIO_MESSAGING_SERVICE_SID` instead — it
takes precedence with no code change.
