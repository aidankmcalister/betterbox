<div align="center">

<img src="public/favicon.svg" width="72" height="72" alt="BetterBox logo" />

# BetterBox

**All your inboxes. One tab.**

A new interface for the Gmail accounts you already have. Built on the Gmail API, not another email service.

[Website](https://betterbox.dev) · [Privacy](https://betterbox.dev/privacy) · [Contributing](.github/CONTRIBUTING.md)

</div>

---

https://github.com/user-attachments/assets/25ccf3b2-7f29-44f9-814a-54f0ac2ed3f7

> [!WARNING]
> **Mega-alpha.** Moving fast, expect rough edges. Self-host works today; hosted is [waitlisted](https://betterbox.dev).

Your mail stays in Gmail. BetterBox does not move, migrate, or store it. It puts what you check all day in one place: your inboxes, your GitHub pull requests, and (soon) your Linear issues. Think tiling window manager for your inboxes.

## Setup

You'll need [Bun](https://bun.sh), PostgreSQL, and a Google Cloud OAuth app.

```bash
git clone https://github.com/aidankmcalister/betterbox.git
cd betterbox
bun install
cp .env.example .env
```

Fill in `.env` (the comments explain each value), then:

```bash
bun run db:push   # create the schema
bun run dev       # http://localhost:3000
```

Sign in with Google. `ALLOWED_EMAILS` is a comma-separated allowlist (empty allows anyone). For owner tools (seeded demo accounts): `bun run set-owner you@example.com`.

**Google (required).** In the [Cloud Console](https://console.cloud.google.com), enable the Gmail API, add the `gmail.modify` scope, and create an OAuth client with redirect URI `http://localhost:3000/api/auth/callback/google`. Keep the app in Testing to skip Google's ~$750/yr assessment.

**GitHub (optional).** Powers the Pull requests page. Create an OAuth app in [Developer Settings](https://github.com/settings/developers) with callback `http://localhost:3000/api/auth/callback/github`, add the keys to `.env`, then connect it from Settings. Scopes: `read:user`, `repo` (or `public_repo` for public only).

**Linear (soon).** The Issues page is on the way.

## Features

- **Every inbox, one screen.** Multiple Gmail accounts as panes you drag, split, and resize.
- **Read fast.** Movable reading pane with inline reply. HTML renders in a sandboxed iframe with remote subresources stripped or proxied, so trackers never see your IP.
- **Command palette.** Compose, switch accounts, search, and export from one menu (⌘K).
- **Pull requests.** Open PRs, review requests, and CI status, live from GitHub.
- **Tags are Gmail labels.** Create, apply, rename, recolor. Stored in Gmail, not here.
- **Private by design.** Mail fetched live, held only in your browser. Tokens encrypted at rest. No analytics, no server-side mail.
- **Open source.** MIT licensed. Audit it, fork it, self-host it free.

## Self-host or hosted

Self-host is free and open source: your own OAuth app, your own infra, your own credentials. Nothing is gated, no data leaves your machine. The example `.env` sets `IS_SELF_HOSTED=true`, which hides the marketing layer (landing, waitlist, pricing); unset it to run that locally.

Hosted ($5/mo) is the same code, run by us. Waitlisted while I gauge demand: Google's ~$750/yr assessment for third-party Gmail apps needs justifying first.

[Join the hosted waitlist →](https://betterbox.dev)

## Tech stack

[TanStack Start](https://tanstack.com/start) (React 19, SSR) · Tailwind CSS v4 + shadcn/ui on [Base UI](https://base-ui.com) · [Better Auth](https://better-auth.com) · PostgreSQL via [Prisma](https://prisma.io) 7 · [Bun](https://bun.sh) with Nitro.

## Contributing

Issues and PRs welcome. See [CONTRIBUTING](.github/CONTRIBUTING.md). Run `bun run typecheck` and `bun run format` before pushing.

---

<div align="center">

Built by [Aidan McAlister](https://github.com/aidankmcalister). Not affiliated with Google or Gmail.

</div>
