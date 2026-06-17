# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`text-them` is a group SMS broadcast app. People opt in to a group by texting a
**keyword** to a shared Twilio number; admins manage groups and send broadcasts
from a web dashboard. It's an npm-workspaces monorepo: `apps/api` (Fastify
backend), `apps/web` (React dashboard), `packages/shared` (types shared by both).

## Commands

```bash
npm install                              # install all workspaces

# Build — shared MUST be built before the apps (they import its compiled dist)
npm run build --workspace @text-them/shared
npm run build:web                        # builds shared + web (used by Cloudflare)
npm run build                            # build everything

# Dev (run in separate terminals)
docker compose up -d mongo               # local MongoDB on :27017
npm run dev:api                          # API on :8080 (loads root .env via --env-file)
npm run dev:web                          # Vite on :5173

# Quality
npm run typecheck                        # all workspaces
npm test                                 # api Vitest suite (spins up in-memory Mongo)

# Single test file / pattern
npm test --workspace @text-them/api -- src/services/subscriptions.test.ts
npm test --workspace @text-them/api -- -t "unsubscribes from all groups on STOP"
```

`packages/shared` is consumed as compiled output (`dist/index.js`), so after
changing shared types run its build (or `npm run dev` in that package for watch)
before the apps will see the changes.

## Architecture

### Shared types vs. Mongo documents
`packages/shared` holds the **wire types** (`Group`, `Member`, `BroadcastMessage`,
DTOs) where ids/dates are strings — used by both API responses and the frontend.
The API keeps separate **document types** in `apps/api/src/db/documents.ts` using
`ObjectId`/`Date`. `apps/api/src/serializers.ts` converts documents → wire types at
the response boundary. Don't leak `ObjectId`/`Date` into responses.

### API composition (`apps/api`)
`src/app.ts` `buildApp()` wires everything via dependency injection so the same app
is used in production and tests: it takes a `TwilioService`, an optional
`Database`, and an optional `authenticator`. `src/server.ts` is the thin
production entrypoint; tests call `buildApp` directly with an in-memory Mongo and
stubs (see `src/routes/groups.test.ts`).

- **Auth is scoped, not global.** Clerk middleware is registered only inside an
  encapsulated child context that contains the protected routes (`groupRoutes`,
  `messageRoutes`). Public routes — `/health` and the Twilio webhook — live
  outside it and never touch Clerk. `src/plugins/auth.ts` decorates `requireAuth`
  (throws 401) and `request.userId`. Tests bypass Clerk by passing an
  `authenticator` stub; production uses `clerkAuthenticator` (reads `getAuth`).
- **Twilio webhook security.** `POST /api/twilio/inbound` is *not* Clerk-protected;
  it verifies Twilio's signature instead (`TwilioService.validateSignature`). Set
  `TWILIO_SKIP_SIGNATURE_VALIDATION=true` only for local testing.
- **Core inbound logic is isolated** in `src/services/subscriptions.ts`
  (`processInbound`): it normalizes the body and dispatches STOP/HELP/keyword →
  subscription state changes. STOP and HELP are matched before group keywords so
  they always win (carrier compliance). This is the most test-covered unit.
- **Outbound sender is either/or.** `src/services/twilio.ts` uses a Messaging
  Service when `TWILIO_MESSAGING_SERVICE_SID` is set, otherwise `TWILIO_FROM_NUMBER`.
  Config validation requires at least one.

### Data model
Collections: `groups`, `members`, `subscriptions` (the opt-in audit trail with
status + timestamps), `messages` (broadcast log), `inbound_messages` (every
received SMS). Indexes are created on boot in `src/db/index.ts` (`ensureIndexes`):
unique on `groups.keyword` and `members.phoneNumber`, unique compound
`{memberId, groupId}` on subscriptions. The database name is **`textthem`**
(`MONGODB_DB_NAME`), the same in local and production.

### Frontend (`apps/web`)
React + Vite + Tailwind + shadcn/ui (components owned in `src/components/ui`).
- **Routing splits public vs. authed** (`src/App.tsx`): `/privacy` and `/terms`
  are rendered outside the Clerk `<SignedIn>` gate so they're reachable without
  signing in (required for A2P 10DLC / carrier review). Everything else is gated.
- **API access**: `src/lib/api.ts` `createApiClient(getToken)` attaches the Clerk
  JWT to every request; `src/lib/hooks.ts` wraps it in TanStack Query hooks.
- Vite reads env from the **repo root** (`envDir` in `vite.config.ts`), so the one
  root `.env` serves both api and web; only `VITE_`-prefixed vars reach the client.

## Environment & secrets
- Local dev loads the **root `.env`** (git-ignored). `.env.example` documents all
  vars. `apps/api/.env.local` and `apps/api/.env.production.local` hold secrets for
  the one-off scripts and the Fly deploy respectively — both git-ignored and not
  loaded by `npm run dev:api`.
- Config is parsed/validated once in `src/config.ts` (Zod); the server refuses to
  start on invalid/missing env.

## Deployment
- **API → Fly.io** (`apps/api/fly.toml`, app `textthem-api`). Build context is the
  repo root: `fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile .`.
  Secrets (`MONGODB_URI`, Twilio, Clerk, `CORS_ORIGINS`, `PUBLIC_BASE_URL`) are set
  via `fly secrets`; non-secret env (`MONGODB_DB_NAME`, `PORT`) is in `fly.toml`.
- **Web → Cloudflare Pages**: build command `npm run build:web`, output
  `apps/web/dist`, root `/`. `apps/web/public/_redirects` provides SPA fallback so
  deep links (`/privacy`) resolve. Node pinned via `.nvmrc`.
- **DB → MongoDB Atlas**: the Fly app needs the cluster to allow its egress
  (`0.0.0.0/0` on the free tier) and a `readWrite`-on-`textthem` user.

## Operational scripts (`apps/api/scripts/`, run with `node --env-file=… --import tsx`)
`send-test-broadcast.ts` (live SMS test), `check-message-status.ts` (delivery
status by SID), `check-a2p-status.ts` (10DLC brand/campaign readiness),
`check-mongo.ts` (validate a connection string + scoped-user access).

## Gotchas
- US A2P 10DLC: outbound SMS from an unregistered number returns Twilio error
  **30034** (undelivered) even though the API call succeeds. Registration (Brand +
  Campaign on the Messaging Service) is required for delivery, not a code issue.
- The Clerk placeholder in `.env.example` uses the `sk_test_`/`pk_test_` prefix,
  which GitHub push protection flags as a Stripe key — keep placeholders
  non-alphanumeric after the prefix to avoid false positives.
