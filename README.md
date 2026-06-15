<div align="center">

<img src="public/favicon.svg" width="72" height="72" alt="BetterBox logo" />

# BetterBox

**Gmail, at developer speed.**

A fast, dense, keyboard-first client for every Google inbox you have — built on the Gmail API, not another email service.

[Website](https://betterbox.dev) · [Live demo](https://betterbox.dev) · [Privacy](https://betterbox.dev/privacy) · [Contributing](.github/CONTRIBUTING.md)

<!-- TODO: drop in the demo gif here -->

</div>

---

> [!WARNING]
> **Mega-alpha.** BetterBox is in active development and moves fast — expect rough edges and the occasional `Soon` badge. Self-host works today, straight from source; the hosted plan is behind a [waitlist](https://betterbox.dev) while Google verifies the app.

Your mail already lives in Gmail. BetterBox doesn't move it, migrate it, or store it — it's a _better client_ for the accounts you already have. Think tiling window manager for your inboxes: every account on one screen, every action a keystroke away, with real developer tooling (pull requests, raw MIME, exports) built in.

## Quick start

You'll need [Bun](https://bun.sh), a PostgreSQL database, and a Google Cloud OAuth app.

```bash
git clone https://github.com/aidankmcalister/betterbox.git
cd betterbox
bun install
```

Create a `.env`:

```dotenv
DATABASE_URL=postgresql://...
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=...          # also encrypts OAuth tokens at rest
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# optional: comma-separated emails allowed to sign in (empty = anyone)
ALLOWED_EMAILS=you@example.com
# optional — enables the Pull requests page
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
# self-host mode (default): straight to the app, no landing page or waitlist.
# comment out to run the hosted marketing layer instead.
IS_SELF_HOSTED=true
```

In the Google Cloud console: enable the Gmail API, add the `gmail.modify` scope, and set the redirect URI to `http://localhost:3000/api/auth/callback/google`.

```bash
bun run db:push   # set up the database
bun run dev       # http://localhost:3000
```

Then open `http://localhost:3000`. In self-host mode (the default above) `/` redirects straight to `/temp-sign-in`, where you sign in with Google. To control who can get in, set `ALLOWED_EMAILS` to a comma-separated list of addresses; only those can create an account (leave it empty to allow anyone).

That's it. Want the owner-only tools (seeded test accounts + demo mode)? Run `bun run set-owner you@example.com`.

## Self-host mode

The example `.env` ships with `IS_SELF_HOSTED=true`, so self-hosted instances skip the marketing layer: `/` redirects directly to sign-in, and the landing page and waitlist are not accessible.

The official hosted deployment leaves the variable unset, which falls back to hosted mode (landing page + waitlist). To run that locally, comment the line out:

```bash
# IS_SELF_HOSTED=true
```

## Features

- **Every inbox, one screen.** Link multiple Gmail accounts and arrange them as panes you drag, split, and resize like a tiling WM. Colored dots keep accounts apart; composed views merge them.
- **Read fast.** A movable reading pane renders the whole conversation with inline reply. HTML email renders in a sanitized, sandboxed iframe: remote images are proxied and every other remote subresource (stylesheets, web fonts, media, CSS `url()`) is stripped, so trackers never see your IP. Raw MIME is one keystroke away.
- **`⌘K` everything.** A command palette for compose, account switching, search, export, and settings — plus `G I` to inbox and `⌥1–9` to jump between accounts.
- **Pull requests.** Link GitHub (an account link, not a new login) and see your PRs — open, awaiting your review, approved, merged — in a dense list pulled live from the GitHub API.
- **Developer tooling.** Raw MIME view and exports to Markdown / JSON / plain text.
- **Tags are Gmail labels.** Create, apply, rename, recolor, and delete labels; the **Labeled** view groups mail per tag. BetterBox stores nothing about them.
- **Private by design.** Mail is fetched live and held only in your browser — never on our servers. OAuth tokens are encrypted at rest. No analytics.

## Tech stack

| Layer     | Choice                                                                                    |
| --------- | ----------------------------------------------------------------------------------------- |
| Framework | [TanStack Start](https://tanstack.com/start) (React 19, SSR)                              |
| Styling   | Tailwind CSS v4 + shadcn/ui (on [Base UI](https://base-ui.com))                           |
| Auth      | [Better Auth](https://better-auth.com) — Google + GitHub, multi-account, encrypted tokens |
| Database  | PostgreSQL via [Prisma](https://prisma.io) 7 (`@prisma/adapter-pg`)                       |
| Runtime   | [Bun](https://bun.sh) · deployed with Nitro                                               |
| Tooling   | Prettier (format), Biome (lint), Vitest / `bun test`                                      |

## Scripts

| Command             | Does                                |
| ------------------- | ----------------------------------- |
| `bun run dev`       | Dev server on port 3000             |
| `bun run build`     | Production build                    |
| `bun run typecheck` | TypeScript checks                   |
| `bun run format`    | Prettier (write)                    |
| `bun run lint`      | Biome lint                          |
| `bun run db:push`   | Push the schema without a migration |
| `bun run db:studio` | Open Prisma Studio                  |
| `bun run set-owner` | Grant the `OWNER` role to an email  |

## Self-host or hosted

Self-host is free and open source — bring your own Google OAuth app and run it on your own infra. Hosted ($5/mo, 7-day trial) is the same code, run and updated by us, for people who don't want to manage it. The waitlist is for hosted only; self-host isn't gated. [Join the waitlist →](https://betterbox.dev)

## Contributing

Issues and PRs are welcome — see [CONTRIBUTING](.github/CONTRIBUTING.md). The short version: `bun install`, `bun run dev`, and run `bun run typecheck` + `bun run format` before pushing.

---

<div align="center">

Built by [Aidan McAlister](https://github.com/aidankmcalister). Not affiliated with Google or Gmail.

</div>
