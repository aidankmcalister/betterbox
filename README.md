<div align="center">

<img src="public/favicon.svg" width="72" height="72" alt="BetterBox logo" />

# BetterBox

**All your inboxes. One tab.**

A different interface for the Gmail accounts you already have. Built on the Gmail API, not another email service. Your mail stays in Google.

[Website](https://betterbox.dev) · [Privacy](https://betterbox.dev/privacy) · [Contributing](.github/CONTRIBUTING.md)

</div>

---

[![Two Gmail inboxes side by side in one BetterBox tab](.github/assets/demo-poster.jpg)](https://betterbox.dev)

> [!WARNING]
> **Mega-alpha.** BetterBox is in active development and moves fast. Expect rough edges and the occasional `Soon` badge. Self-host works today; hosted is behind a [waitlist](https://betterbox.dev) while I gauge demand.

Your mail stays in Gmail. BetterBox does not move it, migrate it, or store it. It puts the things you check all day in one place: your inboxes, your GitHub pull requests, and (soon) your Linear issues. Think tiling window manager for your inboxes.

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

Sign in with Google. Set `ALLOWED_EMAILS` to a comma-separated allowlist, or leave it empty to allow anyone. For owner-only tools (seeded demo accounts), run `bun run set-owner you@example.com`.

**Google (required).** In the [Cloud Console](https://console.cloud.google.com): enable the Gmail API, add the `gmail.modify` scope on the OAuth consent screen, and create an OAuth client with redirect URI `http://localhost:3000/api/auth/callback/google`. Keep the app in Testing to skip Google's ~$750/yr security assessment.

**GitHub (optional).** Powers the Pull requests page. Create an OAuth app in [Developer Settings](https://github.com/settings/developers) with callback `http://localhost:3000/api/auth/callback/github`, add the ID and secret to `.env`, then connect it from Settings. Scopes: `read:user`, `repo` (or `public_repo` for public repos only).

**Linear (soon).** The Issues page is on the way. Watch the repo to follow along.

## Features

- **Every inbox, one screen.** Link multiple Gmail accounts and arrange them as panes you drag, split, and resize.
- **Read fast.** A movable reading pane with inline reply. HTML email renders in a sandboxed iframe with remote subresources stripped or proxied, so trackers never see your IP.
- **Command palette.** Compose, switch accounts, search, and export from one menu (⌘K).
- **Pull requests.** Your open PRs, review requests, and CI status, live from GitHub.
- **Tags are Gmail labels.** Create, apply, rename, and recolor. BetterBox stores nothing about them.
- **Private by design.** Mail is fetched live and held only in your browser. Tokens are encrypted at rest. No analytics, no server-side mail.
- **Open source.** MIT licensed. Audit it, fork it, self-host it free.

## Self-host or hosted

Self-host is free and open source. Bring your own Google OAuth app, run it on your own infra, and connect each integration with your own credentials. No data leaves your machine, and nothing is gated: clone the repo and go. The example `.env` ships with `IS_SELF_HOSTED=true`, which drops the marketing layer (landing page, waitlist, hosted pricing); unset it to run the hosted layout locally.

Hosted ($5/mo) is the same code, run and updated by us. It is waitlisted while I gauge demand: Google charges about $750/yr for the security assessment that third-party Gmail apps need, and I want enough interest to justify it first.

[Join the hosted waitlist →](https://betterbox.dev)

## Tech stack

[TanStack Start](https://tanstack.com/start) (React 19, SSR) · Tailwind CSS v4 + shadcn/ui on [Base UI](https://base-ui.com) · [Better Auth](https://better-auth.com) · PostgreSQL via [Prisma](https://prisma.io) 7 · [Bun](https://bun.sh) with Nitro.

## Contributing

Issues and PRs welcome. See [CONTRIBUTING](.github/CONTRIBUTING.md). Run `bun run typecheck` and `bun run format` before pushing.

---

<div align="center">

Built by [Aidan McAlister](https://github.com/aidankmcalister). Not affiliated with Google or Gmail.

</div>
