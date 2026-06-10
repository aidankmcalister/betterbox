# Better Mail

A web-based Gmail client for developers — a faster, denser UI on top of the Gmail API. It is **not** a new email service; it reads and acts on existing Gmail accounts.

> Status: early. Auth and basic multi-account reading work. Most client features below are not built yet.

## What it does today

- Sign in with Google (OAuth via Better Auth).
- Link multiple Gmail accounts to one user; all inboxes are usable at once.
- Tiling inbox: each account is a pane you arrange like a tiling window
  manager (drag headers to swap/split, drag seams to resize; layout persists).
- Dense thread list with unread weighting, snippets, account-colored dots,
  and the 50 most recent messages per account.
- Mark all as read (Gmail `batchModify`) from the command palette.
- ⌘K command palette and keyboard shortcuts (`G I`, `⌥1–9`).
- Settings: theme, accent color, per-account colors, row density, snippets.
- Client-side caching via TanStack Query (panes repaint instantly on
  rearrange instead of refetching).

## What it doesn't do yet

Messages are fetched live from Gmail (cached in-memory on the client only) —
nothing is stored or synced server-side. There is no message viewer, no
threads, no send, and no developer-platform features.

## Roadmap

- [ ] Message viewer (full body / thread view)
- [ ] Thread grouping (`threads.get`) instead of flat messages
- [ ] Pagination / load-more (lift the 50-message cap)
- [ ] Compose, reply, forward (threading via `References` / `In-Reply-To`)
- [ ] Labels, star, archive, trash (mark-as-read shipped)
- [ ] Search and filtering
- [ ] Incremental sync (History API) and push (`users.watch` + Pub/Sub)
- [x] Local caching / data layer (TanStack Query)
- [x] Keyboard shortcuts + command palette
- [ ] Export (Markdown / JSON / plain text)
- [ ] Developer surface: outbound webhooks, analytics, API request log
- [ ] Gmail API quota tracking, rate limiting, backoff
- [x] Error / empty / loading states

## Tech stack

- **Framework:** TanStack Start (React 19, SSR, file-based routing)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 + shadcn/ui (`base-nova` style, built on `@base-ui/react` — not Radix)
- **Auth:** Better Auth (Google OAuth, multi-account linking)
- **Database:** PostgreSQL via Prisma 7 (`@prisma/adapter-pg`)
- **Runtime / package manager:** Bun

## Getting started

1. Install dependencies:

   ```bash
   bun install
   ```

2. Create `.env`:

   ```dotenv
   DATABASE_URL=postgresql://...
   BETTER_AUTH_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

   In the Google Cloud console, enable the Gmail API, add the `gmail.modify` scope,
   and set the redirect URI to `http://localhost:3000/api/auth/callback/google`.

3. Set up the database and run:

   ```bash
   bun run db:migrate
   bun run dev
   ```

## Scripts

- `bun run dev` — start the dev server (port 3000)
- `bun run build` — build for production
- `bun run preview` — preview the production build
- `bun run typecheck` — run TypeScript checks
- `bun run db:generate` — regenerate the Prisma client
- `bun run db:push` — push schema changes without a migration
- `bun run db:migrate` — create and apply a migration

## Project layout

- `src/routes/` — pages and API routes (`/api/auth`, `/api/accounts`, `/api/emails`)
- `src/lib/auth.ts`, `src/lib/auth-client.ts` — Better Auth config
- `src/lib/gmail/` — Gmail API calls and per-account token resolution
- `src/components/ui/` — shadcn components
- `prisma/schema.prisma` — `User`, `Session`, `Account`, `Verification`
