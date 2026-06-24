<div align="center">

<img src="public/favicon.svg" width="72" height="72" alt="BetterBox logo" />

# BetterBox

**All your inboxes. One tab.**

Your Gmail inboxes, GitHub pull requests, and issues — side by side as resizable panels. Built on the Gmail and GitHub APIs, not another service. Your mail stays in Google.

[Website](https://betterbox.dev) · [Privacy](https://betterbox.dev/privacy) · [Contributing](.github/CONTRIBUTING.md)

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT" /></a>
  <a href="https://github.com/aidankmcalister/betterbox/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome" /></a>
</p>

</div>

---

> [!WARNING]
> **Mega-alpha.** BetterBox is under active development and moves fast. Expect rough edges, breaking changes, and the occasional `Soon` badge on features that aren't wired up yet. Self-host works today, straight from source. The hosted version is currently behind a [waitlist](https://betterbox.dev).

## What it is

BetterBox is a triage board for the tools developers live in. Link the Gmail accounts you already have and drop them onto a canvas as panels you drag, split, and resize, like a tiling window manager for your mail. Your GitHub pull requests and issues open as panels right beside them, so everything that needs you sits on one screen instead of a dozen tabs.

Nothing migrates. BetterBox reads and sends through the Gmail API, so your mail stays in Google and is never stored on a server. The sidebar is a launcher: add a panel for any inbox, your pull requests, or your issues. Linear is next.

## Features

- **Every inbox, one screen.** Drag, split, and resize your Gmail accounts like windows — then add GitHub panels to the same board.
- **Reading pane.** Movable, with inline reply. HTML renders sandboxed with trackers stripped.
- **Command palette.** Compose, search, switch accounts, and export from ⌘K.
- **Pull requests.** GitHub PRs you authored or were asked to review — with review state, CI, and diff size — live in a panel.
- **Issues.** GitHub issues assigned to or opened by you, in a panel beside your mail. (Linear coming next.)
- **Labels as tags.** Create, rename, and recolor Gmail labels. They stay in Gmail.
- **Private by design.** Mail lives in your browser, never our servers. Tokens encrypted, no analytics.
- **Open source.** Read every line, fork it, or self-host it free.

## Self-host

Run your own instance in a few steps. You'll need [Bun](https://bun.sh), a PostgreSQL database, and a Google Cloud OAuth app.

### 1. Clone and install

```bash
git clone https://github.com/aidankmcalister/betterbox.git
cd betterbox
bun install
cp .env.example .env
```

### 2. Set the core variables

Point `.env` at your database and add an auth secret. Generate the secret with `npx auth@latest secret`; it also encrypts OAuth tokens at rest.

```bash
# ── Required ──────────────────────────────────────────────
DATABASE_URL=postgresql://user:pass@localhost:5432/betterbox
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=your-generated-secret
```

The example already sets `IS_SELF_HOSTED=true`, so `/` goes straight to sign-in (no landing page or waitlist). Leave it as-is.

### 3. Set up Google (required)

In the [Google Cloud Console](https://console.cloud.google.com):

1. Enable the **Gmail API**.
2. On the **OAuth consent screen**, add the `gmail.modify` scope and add yourself as a test user. Keep the app in **Testing** to skip Google's ~$750/yr security assessment.
3. Create an **OAuth client** (web application) with redirect URI `http://localhost:3000/api/auth/callback/google`.
4. Copy the client ID and secret into `.env`:

```bash
# ── Google / Gmail (required) ─────────────────────────────
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### 4. Create the database

Push the Prisma schema to your `DATABASE_URL`:

```bash
bun run db:push
```

### 5. Start it

```bash
bun run dev        # http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google. That account is yours.

### Restrict sign-ups (optional)

Anyone can create an account by default. To limit it, set a comma-separated allowlist:

```bash
# ── Access control ────────────────────────────────────────
ALLOWED_EMAILS=you@example.com,teammate@example.com
```

For the owner-only tools (seeded demo accounts and demo mode), grant yourself the owner role:

```bash
bun run set-owner you@example.com
```

### GitHub (optional)

Enables the GitHub pull requests and issues panels.

1. Create an OAuth app in [GitHub Developer Settings](https://github.com/settings/developers) with callback `http://localhost:3000/api/auth/callback/github`.
2. Add the keys to `.env`, restart, then connect GitHub from Settings. It requests `read:user` and `repo` so it can read your private PRs and issues.

```bash
# ── GitHub integration (optional) ─────────────────────────
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

### Linear (coming soon)

Linear isn't wired up yet. When it ships it will work like GitHub: add the keys and connect Linear from Settings to get your assigned and created issues as a panel.

```bash
# ── Linear integration (optional, coming soon) ────────────
LINEAR_CLIENT_ID=...
LINEAR_CLIENT_SECRET=...
```

## Self-host or hosted

Self-host is free and open source: your own OAuth app, your own database, your own infrastructure. Nothing is gated and no data leaves your machine. To run the hosted layout (landing page and waitlist) locally instead, unset `IS_SELF_HOSTED` in `.env`.

Hosted ($5/mo) is the same code, run and updated by me, for people who would rather not manage it. It is waitlisted for now: Google charges about $750/yr for the security assessment that third-party Gmail apps need, and I want enough interest to justify it first.

[Join the hosted waitlist →](https://betterbox.dev)

## Tech stack

- **Framework:** [TanStack Start](https://tanstack.com/start) (React 19, SSR)
- **Styling:** Tailwind CSS v4 and shadcn/ui on [Base UI](https://base-ui.com)
- **Auth:** [Better Auth](https://better-auth.com), with Google and GitHub, multi-account, encrypted tokens
- **Database:** PostgreSQL via [Prisma](https://prisma.io) 7
- **Runtime:** [Bun](https://bun.sh), deployed with Nitro

## Scripts

| Command             | What it does                           |
| ------------------- | -------------------------------------- |
| `bun run dev`       | Dev server on port 3000                |
| `bun run build`     | Production build                       |
| `bun run typecheck` | TypeScript checks                      |
| `bun run format`    | Format with Prettier                   |
| `bun run lint`      | Lint with Biome                        |
| `bun test`          | Run the test suite                     |
| `bun run db:push`   | Push the Prisma schema to the database |
| `bun run db:studio` | Open Prisma Studio                     |
| `bun run set-owner` | Grant the owner role to an email       |

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING](.github/CONTRIBUTING.md). In short: `bun install`, `bun run dev`, then run `bun run typecheck` and `bun run format` before pushing.

## License

BetterBox is open source under the [MIT license](LICENSE).

---

<div align="center">

Built by [Aidan McAlister](https://github.com/aidankmcalister). Not affiliated with Google or Gmail.

</div>
