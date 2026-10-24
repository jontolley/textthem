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
  `authenticator` stub. Production uses `clerkAuthenticator(config.corsOrigins)`,
  which reads `getAuth` and rejects tokens issued to any other origin (Clerk's
  `azp` claim), as Clerk recommends for production.
- **Twilio webhook security.** `POST /api/twilio/inbound` and
  `POST /api/twilio/status` are *not* Clerk-protected; they verify Twilio's
  signature instead (`TwilioService.validateSignature`). Set
  `TWILIO_SKIP_SIGNATURE_VALIDATION=true` only for local testing.
- **Core inbound logic is isolated** in `src/services/subscriptions.ts`
  (`processInbound`): it normalizes the body and dispatches STOP/HELP/keyword →
  subscription state changes. STOP and HELP are matched before group keywords so
  they always win (carrier compliance). This is the most test-covered unit.
- **Outbound sender is either/or.** `src/services/twilio.ts` uses a Messaging
  Service when `TWILIO_MESSAGING_SERVICE_SID` is set, otherwise `TWILIO_FROM_NUMBER`.
  Config validation requires at least one.
- **Scheduled broadcasts.** `src/services/broadcasts.ts` holds `sendBroadcast`,
  which both "send now" and the scheduler use. Recipients are the group's
  subscribers at send time. `server.ts` passes `schedulerIntervalMs` (30s) to
  `buildApp`, which runs `runDueBroadcasts` on that timer; tests call it
  directly with a fake `now`. Each due broadcast is claimed atomically
  (`scheduled` → `sending`) before any text goes out, so it never sends twice.
  - One more than an hour late is marked `missed`, not sent.
  - One stuck in `sending` for over 10 minutes is marked `interrupted` and never retried.
  - This relies on Fly keeping a machine running (`min_machines_running = 1`).
- **Delivery tracking.** Broadcast sends pass `statusCallback`
  (`PUBLIC_BASE_URL` + `/api/twilio/status`). `src/services/deliveries.ts` keeps one
  `deliveries` doc per Message SID; callbacks only move a status forward (they
  repeat and arrive out of order), and History's delivered/undelivered counts are
  aggregated from those docs at read time.

### Data model
Collections: `groups`, `members`, `subscriptions` (the opt-in audit trail with
status + timestamps), `messages` (broadcasts, including scheduled ones: `status` is
scheduled/sending/sent/canceled/missed/interrupted, absent = sent), `deliveries` (per-recipient
Twilio status of each broadcast send), `inbound_messages` (every received SMS). Indexes are created on boot in `src/db/index.ts` (`ensureIndexes`):
unique on `groups.keyword`, `members.phoneNumber`, and `deliveries.twilioSid`, unique compound
`{memberId, groupId}` on subscriptions. The database name is **`textthem`**
(`MONGODB_DB_NAME`), the same in local and production.

### Frontend (`apps/web`)
React + Vite + Tailwind + shadcn/ui (components owned in `src/components/ui`).
- **Routing splits public vs. authed** (`src/App.tsx`). `src/routes/public.tsx`
  holds Text Them's own `/privacy` and `/terms` (the policies Google's OAuth review
  reads, so keep the "How We Use Google User Data" section accurate), and the
  per-org public pages: `/:orgSlug/join` (lists the org's groups),
  `/:orgSlug/:keyword/join` (one group's call to action), `/:orgSlug/privacy`,
  and `/:orgSlug/terms`. They're rendered outside the Clerk `<SignedIn>` gate so
  they're reachable without signing in (required for A2P 10DLC / carrier
  review). Everything else is gated.
- **Public pages are prerendered.** `npm run build` (web) also runs
  `npm run prerender`. That builds `src/prerender.tsx` for SSR and runs
  `scripts/prerender.js`, which writes each public page to
  `dist/<path>.html`, so the content and `<title>` show without JavaScript. Page
  titles come from `useDocumentTitle` (via `LegalLayout`).
- **Orgs** are defined in `src/config/org.ts` (`ORGS`, keyed by `slug`). Each
  org's campaign points at its own pages; `OrgRoute` resolves the slug and pages
  read it via `useOrg()`. Unknown slugs and keywords render "not found". An org's
  `groups` (keyword, name, description) drive its Join pages. Keep them in step
  with the groups in the dashboard: they're config, not read from the API. Add an
  org by adding an entry. SMS reply text still uses the API's single `ORG_NAME`.
- **Look**: brand green `#0f766e` is the shadcn `--primary` token in
  `src/index.css`, so buttons, links and the green header bars all follow it.
  The font is Inter, from Google Fonts in `index.html`. Clerk gets matching
  `appearance` in `main.tsx`. Signed-out visitors to `/` see `LandingPage`.
- **Icons**: `apps/web/public` holds the favicon, Apple and Android icons, and
  `site.webmanifest`. They're rendered from the SVGs in `apps/web/icons/` by
  `python3 apps/web/icons/render.py`, which needs Chrome and Pillow. Edit the
  SVGs, then rerun it.
- **API access**: `src/lib/api.ts` `createApiClient(getToken)` attaches the Clerk
  JWT to every request; `src/lib/hooks.ts` wraps it in TanStack Query hooks.
- Vite reads env from the **repo root** (`envDir` in `vite.config.ts`), so the one
  root `.env` serves both api and web; only `VITE_`-prefixed vars reach the client.

### Version info
The dashboard's Help page (`/help`) shows which commit each side was built
from. The two often differ, because the API only redeploys when `apps/api` or
`packages/shared` change.
- **Dashboard:** `vite.config.ts` bakes in `__APP_COMMIT__` (Cloudflare's
  `CF_PAGES_COMMIT_SHA`, else `git rev-parse HEAD`) and `__APP_BUILT_AT__`.
  Both are null in the dev server.
- **API:** the image gets `GIT_SHA`/`BUILT_AT` as Docker build args from the
  deploy workflow. Signed-in users can read them at `GET /api/version`.

## Environment & secrets
- Local dev loads the **root `.env`** (git-ignored). `.env.example` documents all
  vars. `apps/api/.env.local` and `apps/api/.env.production.local` hold secrets for
  the one-off scripts and the Fly deploy respectively — both git-ignored and not
  loaded by `npm run dev:api`.
- Config is parsed/validated once in `src/config.ts` (Zod); the server refuses to
  start on invalid/missing env.

## Deployment
- **API → Fly.io** (`apps/api/fly.toml`, app `textthem-api`). Pushes to `main`
  deploy via `.github/workflows/deploy-api.yml`. Build context is the repo root.
  A manual deploy should pass the version stamp too, or the Help page shows
  "Local build":
  `fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile --build-arg GIT_SHA=$(git rev-parse HEAD) --build-arg BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ) .`
  Secrets (`MONGODB_URI`, Twilio, Clerk, `CORS_ORIGINS`, `PUBLIC_BASE_URL`) are set
  via `fly secrets`; non-secret env (`MONGODB_DB_NAME`, `PORT`) is in `fly.toml`.
- **Web → Cloudflare Pages**: build command `npm run build:web`, output
  `apps/web/dist`, root `/`.
  - Pages serves the prerendered `dist/<path>.html` for `/<path>`.
  - With no `404.html`, Pages runs in SPA mode and serves `index.html` for every other path, which covers the dashboard routes.
  - Don't add a `_redirects` catch-all. Cloudflare applies `_redirects` rules even when a file matches, so it would hide the static pages.
  - Custom domain `textthem.app` (DNS on Cloudflare; registrar IONOS). Node pinned via `.nvmrc`.
  - Build variable `VITE_CLERK_PUBLISHABLE_KEY` is baked in at build time, so changing it needs a redeploy (Deployments → Retry deployment).
- **Auth → Clerk**: there are two instances.
  - **Production** (live `pk_live_`/`sk_live_` keys) serves textthem.app. Its domain records (`clerk.`, `accounts.`, `clkmail.`, `clk._domainkey`, `clk2._domainkey`) are DNS-only CNAMEs in Cloudflare, and the Frontend API is `clerk.textthem.app`.
  - Production is **invite-only**: add organizers under Clerk → Users. Google sign-in uses our own OAuth client in Google Cloud project `textthem-512603`, with redirect `https://clerk.textthem.app/v1/oauth_callback`. Its branding isn't verified, so Google's consent screen shows the domain instead of "Text Them".
  - Live keys live in Cloudflare (`VITE_CLERK_PUBLISHABLE_KEY`) and Fly (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
  - The **development** instance (test keys) is for local dev only, since production won't accept localhost; the root `.env` uses it.
- **DB → MongoDB Atlas**: the Fly app needs the cluster to allow its egress
  (`0.0.0.0/0` on the free tier) and a `readWrite`-on-`textthem` user.

## Operational scripts (`apps/api/scripts/`, run with `node --env-file=… --import tsx`)
`send-test-broadcast.ts` (live SMS test), `check-message-status.ts` (delivery
status by SID), `check-a2p-status.ts` (10DLC brand/campaign readiness),
`check-mongo.ts` (validate a connection string + scoped-user access),
`backfill-deliveries.ts` (record delivery status for broadcasts sent before
tracking, matched from Twilio's message log; dry run unless `--write`, and
ambiguous matches are left untracked).

## Gotchas
- US A2P 10DLC: outbound SMS from an unregistered number returns Twilio error
  **30034** (undelivered) even though the API call succeeds. Registration (Brand +
  Campaign on the Messaging Service) is required for delivery, not a code issue.
- The Clerk placeholder in `.env.example` uses the `sk_test_`/`pk_test_` prefix,
  which GitHub push protection flags as a Stripe key — keep placeholders
  non-alphanumeric after the prefix to avoid false positives.
