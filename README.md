# BetterBox

A web-based Gmail client for developers — a faster, denser UI on top of the Gmail API. It is **not** a new email service; it reads and acts on existing Gmail accounts. Lives at [betterbox.dev](https://betterbox.dev).

> Status: major checkpoint. Multi-account tiling inbox, all standard folders, HTML message rendering, threaded reading with inline reply, full-text search, compose/send, tags (Gmail labels), a rule builder, OAuth tokens encrypted at rest, and a privacy policy for Google verification all work. The rule **background runner**, forwarding, attachments, and mobile are still ahead.

## What it does today

- **Sign in with Google** (OAuth via Better Auth). OAuth tokens are
  **encrypted at rest** in Postgres (`account.encryptOAuthTokens`, key =
  `BETTER_AUTH_SECRET`).
- **Multiple Gmail accounts** linked to one user; every inbox usable at once.
- **Tiling inbox:** each account is a pane you arrange like a tiling window
  manager — drag headers to swap/split, drag seams to resize, and the layout
  persists.
- **All the folders:** Inbox, Labeled, Sent, Drafts, Archived, Spam, Trash.
- **Dense thread list:** unread weighting, snippets, account-colored dots, and
  lazy infinite scroll (no "load more" button).
- **Reading pane:** a movable pane that renders the **whole conversation**
  (thread grouping) with an **inline reply** — shared across panes or split
  per-account (a Settings toggle). HTML bodies render in a **sanitized,
  sandboxed iframe** (DOMPurify, no scripts), with remote images **proxied
  through the app** so tracker blockers don't break them and the sender's pixels
  never see your IP. Falls back to plain text, and offers a **raw MIME source
  view** (syntax-highlighted).
- **Tags = Gmail labels:** create, apply, rename, recolor, and delete tags on a
  message. Nothing about a tag is stored by BetterBox — it's a Gmail user label
  (`gmail.modify`). The **Labeled** folder groups mail into per-tag accordions.
- **Rules (builder):** sidebar **Rules** → `/rules` (PRs, Webhooks, API, Jobs
  are **Soon**). A rules table + new/edit modal. Each rule applies to one or
  more accounts, matches on conditions (`from`/`to`/`subject`/`label`/`has
attachment`, with contains/negated/prefix/suffix operators) joined with
  **AND/OR**, and runs an ordered list of actions
  (apply label, archive, star, mark read, trash, forward, trigger webhook) —
  optionally against existing inbox mail too. Rules persist to the DB and a
  **read-only preview** shows what each would catch. The engine runs entirely on
  the `gmail.modify` scope we already hold — no Gmail filter API. _(The
  background runner that fires rules on every new message is the next step, so
  the LAST RUN column reads "never" and webhook/forward/apply-to-existing don't
  execute yet; see Roadmap.)_
- **Search:** per-pane Gmail full-text search from the pane header (scoped to the
  current folder), plus **⌘K** to fire a search across the accounts on screen.
- **Compose & send:** docked composer with an account-aware From selector.
  **Reply is a real threaded reply** (`In-Reply-To` / `References` + Gmail
  `threadId`).
- **Star, archive, trash** (`messages.modify` / `messages.trash`) and **mark as
  read** — per-message on open (configurable delay) and mark-all per account
  (`batchModify`).
- **Export:** any message to Markdown / JSON / plain text, plus copy message-ID.
- **Keyboard:** `⌘K` palette, `G I` to inbox, `⌥1–9` to switch account, and in
  the reader `Esc` to close, `R` to reply. Raw MIME toggles via the reader
  toolbar **Raw** button (`⌥R` shortcut is **Soon** — Option remaps the key on
  macOS and isn't wired yet).
- **Settings:** theme, accent, per-account colors, row density, snippets, clock
  (12/24h), profile icons, shared vs. split reading pane, and which sidebar
  items show. Most are also single-action toggles in ⌘K.
- **Owner tools:** an `OWNER` role unlocks test accounts and a **demo mode**
  (swaps to generated mail so nothing private shows while recording). Gated on
  role + opt-in — invisible to everyone else.
- **Privacy policy** at `/privacy`, written to match the real data practices
  (Google sign-in, `gmail.modify` scope, encrypted tokens, **no server-side
  email storage**, no analytics) with the Google API Services **Limited Use**
  affirmation required for restricted-scope verification.
- **Client-side caching** via TanStack Query — panes repaint instantly on
  rearrange instead of refetching.

## Privacy model

Mail is fetched live from Gmail and held only in the browser cache — never
persisted. The database holds the four Better Auth tables (`User`, `Session`,
`Account`, `Verification`) — with a `role` column on `User` — plus a `Rule`
table. **Rules store
automation config (a condition + actions), not message content** — that's the
one deliberate, user-facing persistence decision, and it's what lets the engine
run server-side. OAuth tokens in the `Account` table are encrypted at rest.

## Known limitations

- **Rules don't auto-run yet.** You can author, save, enable, and preview them,
  but the background runner (History API poll / `users.watch` + Pub/Sub) that
  executes them on every new message is the next step.
- **Forward** is selectable as a rule action but isn't wired to send yet.
- **⌥R raw toggle** isn't wired yet — use the reader toolbar **Raw** button.
- **No mobile / responsive layout** — the tiling pane UI is desktop-only.
- Mail is fetched live and held only in the browser. No incremental sync, no
  offline.

## Roadmap

Done:

- [x] Reading pane (movable, title strip + floating action bar)
- [x] Thread grouping (`threads.get`) + inline reply in the reader
- [x] HTML email rendering (sanitized, sandboxed iframe) + same-origin image proxy
- [x] Raw MIME source view (`format=raw`, syntax-highlighted)
- [x] Lazy infinite scroll (lift the 50-message cap)
- [x] Search (per-pane Gmail full-text, folder-scoped, + ⌘K)
- [x] Export (Markdown / JSON / plain text + copy message-ID)
- [x] Compose & send (docked composer, account-aware From)
- [x] Reply threading (`In-Reply-To` / `References` + Gmail `threadId`)
- [x] Star, archive, trash (`messages.modify` / `messages.trash`)
- [x] Mark as read (`batchModify`)
- [x] All folders (Sent / Drafts / Archived / Spam / Trash / Labeled)
- [x] Tags = Gmail labels (create / apply / rename / recolor / delete) + Labeled folder
- [x] Rules builder + engine (own `gmail.modify` engine, dry-run preview)
- [x] OAuth tokens encrypted at rest
- [x] Local caching / data layer (TanStack Query)
- [x] Keyboard shortcuts + command palette
- [x] Error / empty / loading states
- [x] Privacy policy + Google OAuth verification prep

Next — **mail features:**

- [ ] Forward (`messages.send`)
- [ ] `⌥R` keyboard shortcut for raw MIME toggle
- [ ] Right-click context menu on rows (mark read, reply, trash, hide, copy message-ID, …)
- [ ] Attachments (view + download)
- [ ] Mobile / responsive layout (the tiling pane UI is desktop-only today)

Next — **rules & sync:**

- [ ] Rule background runner (History API poll / `users.watch` + Pub/Sub) so rules fire on new mail
- [ ] Webhook action + apply-rule-to-existing-mail (shares the runner)
- [ ] Gmail API quota tracking + backoff (our calls to Google)

Next — **business:** (i dont want to go broke)

- [ ] Pricing & billing (plans, Stripe)
- [ ] Per-plan usage + rate limits
- [ ] Product analytics (with [Bklit UI](https://bklit.com/))

## Tech stack

- **Framework:** TanStack Start (React 19, SSR, file-based routing)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 + shadcn/ui (`base-nova` style, built on `@base-ui/react` — not Radix)
- **Auth:** Better Auth (Google OAuth, multi-account linking, encrypted tokens)
- **Database:** PostgreSQL via Prisma 7 (`@prisma/adapter-pg`)
- **Email rendering:** DOMPurify sanitization inside a sandboxed iframe, with a same-origin image proxy
- **Testing:** Bun's built-in test runner (`bun test`)
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
   BETTER_AUTH_SECRET=...   # also the OAuth-token encryption key
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

   In the Google Cloud console, enable the Gmail API, add the `gmail.modify` scope,
   and set the redirect URI to `http://localhost:3000/api/auth/callback/google`.

3. Set up the database and run:

   ```bash
   bun run db:push   # or db:migrate once migrations catch up to schema.prisma
   bun run dev
   ```

   The checked-in migration only covers the original auth tables; `schema.prisma`
   also defines `User.role` and the `Rule` table — use `db:push` locally until a
   migration lands.

4. (Optional) Make yourself an owner to unlock test accounts + demo mode:

   ```bash
   bun run set-owner you@example.com
   ```

## Scripts

- `bun run dev` — start the dev server (port 3000)
- `bun run build` — build for production
- `bun run preview` — preview the production build
- `bun run typecheck` — run TypeScript checks
- `bun test` — run the test suite
- `bun run db:generate` — regenerate the Prisma client
- `bun run db:push` — push schema changes without a migration
- `bun run db:migrate` — create and apply a migration
- `bun run db:studio` — open Prisma Studio
- `bun run set-owner <email>` — grant the `OWNER` role
- `bun run encrypt-tokens` — backfill encryption over existing OAuth tokens

## Project layout

- `src/routes/` — pages and API routes
  - `_app.tsx` (app shell + signed-out landing), `_app/` (folder pages,
    `email.$id`, developer pages including `/rules`), `privacy.tsx`
  - `api/` — `auth`, `accounts`, `emails` (list/search/mark-read), `message`
    (full + raw), `send`, `labels`, `rules`, `image-proxy`
- `src/lib/auth.ts`, `src/lib/auth-client.ts` — Better Auth config
- `src/lib/gmail/` — Gmail API calls and per-account token resolution
- `src/lib/mail-queries.ts` — TanStack Query layer over the mail API
- `src/lib/rules.ts` — pure rule engine (matching + descriptions)
- `src/components/` — inbox tiles, reader, composer, command menu, settings,
  tag picker, labeled view, tile board
- `src/components/ui/` — shadcn components
- `scripts/` — `set-owner`, `encrypt-oauth-tokens`
- `prisma/schema.prisma` — `User` (+ `Role`), `Session`, `Account`, `Verification`, `Rule`
