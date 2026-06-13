# Contributing to BetterBox

Thanks for your interest in improving BetterBox. Issues and pull requests are welcome.

## Getting set up

See the [Quick start](../README.md#quick-start) in the README — `bun install`, add a `.env`, `bun run db:push`, `bun run dev`.

## Workflow

1. Fork and branch off `main` (`git checkout -b fix/the-thing`).
2. Make your change. Keep it focused — one concern per PR.
3. Match the surrounding code; the project is dense and keyboard-first by design.
4. Before pushing, run:

   ```bash
   bun run typecheck
   bun run format
   bun run lint
   ```

5. Open a PR with a clear title and a short description of what changed and why.

## Reporting bugs

Open an issue with steps to reproduce, what you expected, and what actually happened. Screenshots help for UI bugs.

## Questions

Not sure about an approach? Open a draft PR or an issue first — it's cheaper to align early than to rework later.
