# BetterBox

A web-based Gmail client for developers — a faster, denser UI on top of the Gmail API. It is **not** a new email service; it reads and acts on existing Gmail accounts. Lives at [betterbox.dev](https://betterbox.dev).

> Status: major checkpoint. Multi-account reading, HTML message rendering, full-text search, compose/send, a full reading pane (raw MIME + export), and a privacy policy for Google verification all work. True reply threading and the developer-platform features are still ahead.

## What it does today

- **Sign in with Google** (OAuth via Better Auth).
- **Multiple Gmail accounts** linked to one user; every inbox usable at once.
- **Tiling inbox:** each account is a pane you arrange like a tiling window
  manager — drag headers to swap/split, drag seams to resize, and the layout
  persists.
- **Dense thread list:** unread weighting, snippets, account-colored dots, the
  50 most recent messages per account, and load-more pagination.
- **Reading pane:** a movable pane with a slim title strip and a floating action
  bar. Renders HTML email bodies in a **sanitized, sandboxed iframe** (DOMPurify,
  no scripts), with remote images **proxied through the app** so tracker blockers
  don't break them and the sender's pixels never see your IP. Falls back to
  plain text, and offers a **raw MIME source view** (syntax-highlighted).
- **Export:** any message to Markdown / JSON / plain text, plus copy message-ID.
- **⌘K command palette** that also runs **Gmail full-text search** across the
  accounts on screen — select a hit to open it in the reader.
- **Compose & send:** docked composer with an account-aware From selector.
  (Reply prefills the recipient and subject — see *Known limitations*.)
- **Mark all as read** (Gmail `batchModify`) from the palette.
- **Keyboard:** `G I` to inbox, `⌥1–9` to switch account, and in the reader
  `Esc` to close, `⌥R` for raw, `R` to reply.
- **Settings:** theme, accent color, per-account colors, row density, snippets,
  technical metadata, and a link to the privacy policy.
- **Privacy policy** at `/privacy`, written to match the real data practices
  (Google sign-in, `gmail.modify` scope, tokens in Postgres, no server-side
  email storage, no analytics) with the Google API Services **Limited Use**
  affirmation required for restricted-scope verification.
- **Client-side caching** via TanStack Query — panes repaint instantly on
  rearrange instead of refetching.

## Known limitations

- **Reply isn't a real reply yet.** It opens the composer prefilled with the
  sender and a `Re:` subject, but sends a brand-new message rather than a
  threaded one — there's no `In-Reply-To` / `References` header, so Gmail shows
  it as a separate conversation. Proper threading is the next item on the
  roadmap.
- Email contents are fetched live from Gmail and held only in the browser —
  nothing is stored or synced server-side. No thread grouping, no incremental
  sync, no offline.

## Roadmap

Done:

- [x] Reading pane (movable, title strip + floating action bar)
- [x] HTML email rendering (sanitized, sandboxed iframe) + same-origin image proxy
- [x] Raw MIME source view (`format=raw`, syntax-highlighted)
- [x] Pagination / load-more (lift the 50-message cap)
- [x] Search (Gmail full-text via ⌘K, across on-screen accounts)
- [x] Export (Markdown / JSON / plain text + copy message-ID)
- [x] Compose & send (docked composer, account-aware From)
- [x] Mark as read (`batchModify`)
- [x] Local caching / data layer (TanStack Query)
- [x] Keyboard shortcuts + command palette
- [x] Error / empty / loading states
- [x] Privacy policy + Google OAuth verification prep

Next — **mail features:**

- [ ] True reply threading (`In-Reply-To` / `References`) — currently sends a new `Re:` message
- [ ] Forward
- [ ] Thread grouping (`threads.get`) instead of flat messages
- [ ] Labels, star, archive, trash
- [ ] Attachments (view + download)

Next — **sync & reliability:**

- [ ] Incremental sync (History API) and push (`users.watch` + Pub/Sub)
- [ ] Gmail API quota tracking + backoff (our calls to Google)

Next — **developer platform:**

- [ ] Outbound webhooks, analytics, API request log
- [ ] Public API + API keys
- [ ] Per-plan rate limiting (throttling BetterBox's own users)

Next — **business:**

- [ ] Pricing & billing (plans, Stripe)
- [ ] Accounts/usage limits per plan

## Tech stack

- **Framework:** TanStack Start (React 19, SSR, file-based routing)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 + shadcn/ui (`base-nova` style, built on `@base-ui/react` — not Radix)
- **Auth:** Better Auth (Google OAuth, multi-account linking)
- **Database:** PostgreSQL via Prisma 7 (`@prisma/adapter-pg`)
- **Email rendering:** DOMPurify sanitization inside a sandboxed iframe, with a same-origin image proxy
- **Build / deploy:** Nitro (Vercel preset) via the Vite plugin
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

- `src/routes/` — pages and API routes
  - `index.tsx` (signed-out home + app), `privacy.tsx` (privacy policy)
  - `api/` — `auth`, `accounts`, `emails` (list/search/mark-read), `message`
    (full + raw), `send`, `image-proxy`
- `src/lib/auth.ts`, `src/lib/auth-client.ts` — Better Auth config
- `src/lib/gmail/` — Gmail API calls and per-account token resolution
- `src/lib/mail-queries.ts` — TanStack Query layer over the mail API
- `src/components/` — inbox tiles, reader, composer, command menu, settings
- `src/components/ui/` — shadcn components
- `prisma/schema.prisma` — `User`, `Session`, `Account`, `Verification`
