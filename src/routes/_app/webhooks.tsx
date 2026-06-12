import { createFileRoute } from "@tanstack/react-router";
import { DeveloperPage } from "@/components/developer-page";

export const Route = createFileRoute("/_app/webhooks")({
  component: () => (
    <DeveloperPage title="Webhooks">
      <div className="space-y-6 max-w-lg">
        <p className="text-zinc-400 text-sm leading-relaxed">
          Pipe incoming emails into any system that accepts an HTTP POST. Define
          a filter, point it at a URL, and BetterBox delivers a signed JSON
          payload the moment a matching message arrives — no polling required.
        </p>
        <ul className="space-y-3 text-sm text-zinc-500">
          <li className="flex gap-3">
            <span className="text-zinc-600 select-none">—</span>
            Forward Datadog or PagerDuty alerts to a Slack bot
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-600 select-none">—</span>
            Auto-create Linear tickets from support emails
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-600 select-none">—</span>
            Payloads are HMAC-signed — verify on your end, replay from the log
          </li>
        </ul>
        <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-500 leading-relaxed">
          <span className="text-zinc-600">POST </span>
          <span className="text-zinc-300">
            https://your-server.com/hooks/email
          </span>
          <br />
          <span className="text-zinc-600">X-BetterBox-Signature: </span>
          <span className="text-zinc-400">sha256=abc123...</span>
        </div>
      </div>
    </DeveloperPage>
  ),
});
