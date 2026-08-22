# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Backend API (Express + Prisma/Postgres) for a Dofus "brisage" (item dismantling) tool. It aggregates data from two external sites — Dofocus (community-submitted coefficients/prices) and DofusDB (item catalog) — and exposes a single local API for a front-end to consume. Almost no authentication: all write endpoints are open/community-editable, except `/favorites` which requires a Clerk session (see `favorites` module below) — the front (Next.js) handles sign-in/sign-up via Clerk, the backend only verifies the session token.

Full endpoint contract lives in `docs/API.md` (French) — read it before changing any route's request/response shape. `docs/FRONT_SEARCH_BAR.md`, `docs/FRONT_COEFFICIENT_PAGE.md`, `docs/FRONT_FAVORITES.md`, and `docs/FRONT_RUNE_PRICES.md` document the front-end integration flows and double as informal specs for the `/items` search, `/coefficients/:itemId/:serverName`, `/favorites`, and `/rune-prices` endpoints respectively.

## Commands

```bash
pnpm dev              # tsx watch src/index.ts — dev server with reload
pnpm build            # tsc -> dist/
pnpm start            # node dist/index.js — run built output

npx prisma studio           # inspect DB data
```

There is no test suite and no lint script configured in `package.json`.

Required env vars (see `.env`): `DATABASE_URL`, `DOFOCUS_API_URL`, `DOFUSDB_API_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`. The server exits at startup (`src/index.ts`) if any are missing. Also used: `API_KEY`, `DOFOCUS_RUNE_REFERER`, `CORS_ORIGIN`, `PORT`.

## Architecture

### Module layout

Each domain lives under `src/modules/<name>/` with a consistent file split:

- `*.routes.ts` — Express `Router`, wires paths to controllers, applies `importRateLimiter` where needed.
- `*.controller.ts` — request/response handling: param parsing, validation (400s), calls into the service, shapes the `{ success, data|error }` JSON envelope.
- `*.service.ts` — business logic and Prisma queries. This is where upserts, external-API orchestration, and the "user submission beats scheduled import for N days" logic live.
- `*.api.ts` — thin axios wrapper around the external API (Dofocus or DofusDB) for that domain, sometimes with its own local cache.
- `*.types.ts` — shapes of external API responses.
- `*.cache.ts` / `*.scheduler.ts` — present where the domain needs an in-memory cache or a `setInterval`-based cron.

Modules: `runes`, `items`, `coefficients`, `admin`, `favorites`, `trades`, `user-rune-prices`. `user-rune-prices` holds per-user, per-server personal rune prices (`UserRunePrice`) — same auth-gated shape as `favorites`/`trades` (`requireAuth`, `clerkMiddleware()` scoped to its router in `src/index.ts`), independent of the community `RunePrice` table; a user can price the same rune differently on each server they play on. `coefficients` is the most involved — it merges data from both `runes` (server list) and `items` (FK target) — read `coefficient.service.ts` before editing it. `favorites` is the only module behind auth: its routes go through `requireAuth` (`src/middlewares/require-auth.ts`), which wraps `@clerk/express`'s `getAuth()` and returns a JSON `401` rather than redirecting (the SDK's own `requireAuth()` is deprecated and redirects to a sign-in URL, which is wrong for a pure JSON API — don't use it). `clerkMiddleware()` is mounted only on the `/favorites` router in `src/index.ts` (`app.use("/favorites", clerkMiddleware(), favoriteRoutes)`), not globally — it throws if `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` are misconfigured, so keeping it scoped means a Clerk config issue can't take down the rest of the API.

### Data model (`prisma/schema.prisma`)

- `Item` — the DofusDB catalog (name, level, effects, etc.), server-independent, synced wholesale via `POST /items/import`.
- `Rune` / `RunePrice` — the ~53 runes and their per-server prices, imported hourly from Dofocus.
- `ItemMarketData` — one row per `(itemId, serverName)`, holding **both** `coefficient` and `craftPrice` plus independent `*Source` (`DOFOCUS`/`USER`) and `*UpdatedAt` tracking for each. This is the single table the front reads for the coefficient page. The two fields are populated by unrelated processes (hourly bulk sweep for coefficient, on-demand fetch for craftPrice) and are each nullable independently — see the doc comment on the model in the schema.
- Prisma client is generated to `src/generated/prisma` (not `node_modules/.prisma`) — see the `generator client` block. Import it via `src/db/prisma.ts`, not by constructing a new `PrismaClient`.
- `FavoriteItem` — one row per `(clerkUserId, itemId, serverName)`, letting a signed-in user bookmark an item's brisage numbers on a given server from `ItemMarketData`. No local `User`/profile table: `clerkUserId` is the opaque Clerk `sub` claim, Clerk stays the sole identity source.
- `UserRunePrice` — one row per `(clerkUserId, runeId, serverName)`, a signed-in user's own rune price, kept fully separate from the community `RunePrice` table (never read/written by the Dofocus import or the shared `getRunePricesBySlug` profitability cache in `coefficient.service.ts`). Same identity model as `FavoriteItem` (opaque `clerkUserId`, no local profile table).
- **`schema.prisma` is shared with the Next.js front-end project, which owns all schema changes and migrations against the real (Neon) database.** This backend repo has no `prisma/migrations` directory and must never run `prisma db push` or `prisma migrate` itself — either would create schema drift against the front-end's migration history and risk a destructive reset there. If a change here requires a new/modified field or model, edit `schema.prisma` and hand off to the user to apply it from the front-end project; don't run any schema-sync command from this repo.

### The "user data wins for 3 days" pattern

Both `RunePrice` and `ItemMarketData` let a manual (`PUT`) submission take priority over the scheduled Dofocus import for `USER_PROTECTION_DAYS` (3 days). This is implemented as a raw SQL upsert (`$executeRawUnsafe`) with a `WHERE NOT (source = 'USER' AND updatedAt > now() - interval '3 days')` guard — see `upsertCoefficients`/`upsertCraftPrices` in `coefficient.service.ts` for the reference implementation. Follow this pattern (not a plain Prisma `upsert`) for any new field with the same "bulk import vs. community edit" tension.

### Schedulers

`src/index.ts` starts three `setInterval`-based jobs on boot (rune import, coefficient import, craft-price refresh — all hourly) and clears them on `SIGINT`/`SIGTERM`. Each scheduled job's underlying function is also exposed as a manual `GET /.../import`-style endpoint behind `importRateLimiter` (5 req / 15 min, shared across all import endpoints) — keep both paths calling the same service function rather than duplicating logic.

`admin.service.ts` (`seedAll`, behind `GET /admin/seed`) chains these same import functions in dependency order for rebuilding a database from scratch: runes + items in parallel first (independent), then coefficients (needs both), then craft-price refresh. It assumes the schema already exists (applied from the front-end project, see note above) — it doesn't create tables.

### Caching

Two independent in-memory cache styles exist:
- `item.cache.ts`: single `Map` snapshot of the whole `Item` table, 1h TTL, used by `coefficient.service.ts`'s `getInterestingItems` to avoid re-querying per result.
- `coefficient.api.ts`: per-server TTL cache (5 min) around the Dofocus bulk-coefficient call, keyed by lowercased server name.

Note: `coefficient.cache.ts` implements a more elaborate stale-while-revalidate variant of the same cache but is currently unused (nothing imports from it) — check before assuming it's live.

### Error/response conventions

Every controller returns `{ success: true, data|imported|refreshed|count|pagination, ... }` on success or `{ success: false, error: string }` on failure, with `400` for invalid input, `404` for missing resources, `429` from `importRateLimiter`, `500` for unhandled errors. Follow this envelope exactly for any new endpoint — the front relies on `success` as the discriminant.

Server names (`serverName`) are free-form strings, not validated against a fixed list anywhere in the backend — the known list is derived at runtime from distinct `RunePrice.serverName` values (see `getKnownServerNames` in `coefficient.service.ts`), not hardcoded.
