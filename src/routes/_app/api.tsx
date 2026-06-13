import { createFileRoute } from "@tanstack/react-router";
import { DeveloperPage } from "@/components/developer-page";

export const Route = createFileRoute("/_app/api")({
  component: () => (
    <DeveloperPage title="API">
      <div className="max-w-lg space-y-6">
        <p className="text-sm leading-relaxed text-zinc-400">
          Query your inbox programmatically with a personal API key. Your linked
          accounts, your rules, your webhooks — all accessible over HTTP so you
          can script, automate, and integrate however you want.
        </p>
        <ul className="space-y-3 text-sm text-zinc-500">
          <li className="flex gap-3">
            <span className="text-zinc-600 select-none">—</span>
            Search and read messages from any script or terminal
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-600 select-none">—</span>
            Manage rules and webhooks without opening the UI
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-600 select-none">—</span>
            Scoped, revocable keys — generate one per integration
          </li>
        </ul>
        <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-500">
          <span className="text-zinc-600">GET </span>
          <span className="text-zinc-300">/v1/messages?from=stripe.com</span>
          <br />
          <span className="text-zinc-600">Authorization: </span>
          <span className="text-zinc-400">Bearer bb_live_...</span>
        </div>
      </div>
    </DeveloperPage>
  ),
});
