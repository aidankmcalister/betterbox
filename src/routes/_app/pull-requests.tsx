import { createFileRoute } from "@tanstack/react-router";
import { DeveloperPage } from "@/components/developer-page";

export const Route = createFileRoute("/_app/pull-requests")({
  component: () => (
    <DeveloperPage title="Pull requests">
      <div className="space-y-6 max-w-lg">
        <p className="text-zinc-400 text-sm leading-relaxed">
          A focused view of your pull request activity across all linked
          accounts. BetterBox parses your GitHub notification emails and
          surfaces PR reviews, approvals, comments, and merges without the rest
          of the inbox noise.
        </p>
        <ul className="space-y-3 text-sm text-zinc-500">
          <li className="flex gap-3">
            <span className="text-zinc-600 select-none">—</span>
            Separate signal from spam — only PRs that need your attention
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-600 select-none">—</span>
            See review requests, approvals, and merge notifications at a glance
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-600 select-none">—</span>
            Works across all linked accounts, personal and work GitHub side by
            side
          </li>
        </ul>
      </div>
    </DeveloperPage>
  ),
});
