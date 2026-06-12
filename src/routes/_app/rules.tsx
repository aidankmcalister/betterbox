import { createFileRoute } from "@tanstack/react-router";
import { DeveloperPage } from "@/components/developer-page";

export const Route = createFileRoute("/_app/rules")({
  component: () => (
    <DeveloperPage title="Rules">
      <div className="space-y-6 max-w-lg">
        <p className="text-zinc-400 text-sm leading-relaxed">
          Automate what happens to incoming mail. Set a condition, pick an
          action, and BetterBox handles it on every new message across every
          linked account — without you touching it.
        </p>
        <ul className="space-y-3 text-sm text-zinc-500">
          <li className="flex gap-3">
            <span className="text-zinc-600 select-none">—</span>
            <span>
              <span className="text-zinc-300 font-mono text-xs">
                from:@github.com
              </span>{" "}
              → archive and label{" "}
              <span className="text-zinc-300 font-mono text-xs">dev</span>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-600 select-none">—</span>
            <span>
              <span className="text-zinc-300 font-mono text-xs">
                subject:[CRITICAL]
              </span>{" "}
              → star and move to inbox
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-600 select-none">—</span>
            <span>
              Any rule can also trigger a webhook — rules and webhooks share one
              engine
            </span>
          </li>
        </ul>
      </div>
    </DeveloperPage>
  ),
});
