<div align="center">

<img src="public/favicon.svg" width="72" height="72" alt="BetterBox logo" />

# BetterBox

**All your inboxes. One tab.**

A new interface for the Gmail accounts you already have. Built on the Gmail API, not another email service.

[Website](https://betterbox.dev) · [Privacy](https://betterbox.dev/privacy) · [Contributing](.github/CONTRIBUTING.md)

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT" /></a>
  <a href="https://github.com/aidankmcalister/betterbox/stargazers"><img src="https://img.shields.io/github/stars/aidankmcalister/betterbox" alt="GitHub stars" /></a>
  <a href="https://github.com/aidankmcalister/betterbox/pulse"><img src="https://img.shields.io/github/commit-activity/m/aidankmcalister/betterbox" alt="Commit activity" /></a>
  <a href="https://github.com/aidankmcalister/betterbox/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome" /></a>
</p>

</div>

---

> [!WARNING]
> **Mega-alpha.** BetterBox is under active development and moves fast. Expect rough edges, breaking changes, and the occasional `Soon` badge on features that aren't wired up yet. Self-host works today, straight from source. The hosted version is behind a [waitlist](https://betterbox.dev) while I gauge demand.

## What it is

BetterBox is a different interface for Gmail, not a new email service. Link the Google accounts you already have and see every inbox at once, arranged as panes you drag, split, and resize, like a tiling window manager for your mail.

Nothing migrates. BetterBox reads and sends through the Gmail API, so your mail stays in Google and is never stored on a server. Your open GitHub pull requests live in the same window, with Linear issues coming next.

## Features

- **Every inbox on one screen.** Link multiple Gmail accounts and arrange them as panes you drag, split, and resize. Color dots keep accounts apart; merged views combine them.
- **A fast reading pane.** Open a thread in a movable pane and reply inline. HTML email renders in a sandboxed iframe: remote images are proxied and every other remote subresource is stripped, so trackers never see your IP.
- **Command palette.** Compose, switch accounts, search, and export from one menu (⌘K).
- **Pull requests.** Connect GitHub to see your open PRs, review requests, and CI status, live from the GitHub API.
- **Issues.** Connect Linear to see assigned issues alongside your mail. (Coming soon.)
- **Labels as tags.** Create, apply, rename, and recolor Gmail labels. They live in Gmail; BetterBox stores nothing about them.
- **Private by design.** Mail is fetched live and held only in your browser. OAuth tokens are encrypted at rest. No analytics, no mail stored server-side.
- **Open source.** Audit every line, fork it, or self-host it for free.

## Self-host

You'll need [Bun](https://bun.sh), a PostgreSQL database, and a Google Cloud OAuth app.

```bash
git clone https://github.com/aidankmcalister/betterbox.git
cd betterbox
bun install
cp .env.example .env
```

Set the core values in `.env`:

- `DATABASE_URL`: your PostgreSQL connection string.
- `BETTER_AUTH_URL`: `http://localhost:3000` for local dev.
- `BETTER_AUTH_SECRET`: generate with `npx auth@latest secret`. It also encrypts OAuth tokens at rest.

### Google (required)

In the [Google Cloud Console](https://console.cloud.google.com):

1. Enable the **Gmail API**.
2. On the **OAuth consent screen**, add the `gmail.modify` scope and add yourself as a test user. Keep the app in **Testing** to skip Google's ~$750/yr security assessment.
3. Create an **OAuth client** (web application) with redirect URI `http://localhost:3000/api/auth/callback/google`.
4. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Create the schema and start the app:

```bash
bun run db:push
bun run dev        # http://localhost:3000
```

Sign in with Google. To restrict who can create an account, set `ALLOWED_EMAILS` to a comma-separated list (leave it empty to allow anyone). For the owner-only tools (seeded demo accounts and demo mode), run `bun run set-owner you@example.com`.

### GitHub (optional)

Powers the Pull requests page.

1. Create an OAuth app in [GitHub Developer Settings](https://github.com/settings/developers) with callback `http://localhost:3000/api/auth/callback/github`.
2. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`.
3. Restart, then connect GitHub from Settings. It requests `read:user` and `repo` so it can read your private PRs.

### Linear (coming soon)

The Issues page isn't built yet. When it ships it will work like GitHub: set `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET`, then connect Linear from Settings.

## Self-host or hosted

Self-host is free and open source: your own OAuth app, your own database, your own infrastructure. Nothing is gated and no data leaves your machine. The example `.env` ships with `IS_SELF_HOSTED=true`, which drops the marketing layer (landing page, waitlist, hosted pricing) and sends `/` straight to sign-in. Unset it to run the hosted layout locally.

Hosted ($5/mo) is the same code, run and updated by me, for people who would rather not manage it. It is waitlisted for now: Google charges about $750/yr for the security assessment that third-party Gmail apps need, and I want enough interest to justify it first.

[Join the hosted waitlist →](https://betterbox.dev)

## Tech stack

- **Framework:** [TanStack Start](https://tanstack.com/start) (React 19, SSR)
- **Styling:** Tailwind CSS v4 and shadcn/ui on [Base UI](https://base-ui.com)
- **Auth:** [Better Auth](https://better-auth.com), with Google and GitHub, multi-account, encrypted tokens
- **Database:** PostgreSQL via [Prisma](https://prisma.io) 7
- **Runtime:** [Bun](https://bun.sh), deployed with Nitro

## Scripts

| Command | What it does |
| ------- | ------------ |
| `bun run dev` | Dev server on port 3000 |
| `bun run build` | Production build |
| `bun run typecheck` | TypeScript checks |
| `bun run format` | Format with Prettier |
| `bun run lint` | Lint with Biome |
| `bun test` | Run the test suite |
| `bun run db:push` | Push the Prisma schema to the database |
| `bun run db:studio` | Open Prisma Studio |
| `bun run set-owner` | Grant the owner role to an email |

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING](.github/CONTRIBUTING.md). In short: `bun install`, `bun run dev`, then run `bun run typecheck` and `bun run format` before pushing.

## Contributors

<a href="https://github.com/aidankmcalister/betterbox/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=aidankmcalister/betterbox" alt="Contributors" />
</a>

## Acknowledgements

BetterBox stands on a lot of open source. Thanks to [TanStack Start](https://tanstack.com/start), [Better Auth](https://better-auth.com), [Prisma](https://prisma.io), [shadcn/ui](https://ui.shadcn.com), [Base UI](https://base-ui.com), [Tailwind CSS](https://tailwindcss.com), and [Bun](https://bun.sh).

## License

BetterBox is open source under the [MIT license](LICENSE).

---

<div align="center">

Built by [Aidan McAlister](https://github.com/aidankmcalister). Not affiliated with Google or Gmail.

</div>
