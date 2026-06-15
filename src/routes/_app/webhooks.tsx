import { createFileRoute } from "@tanstack/react-router";
import { DeveloperPage } from "@/components/developer-page";

export const Route = createFileRoute("/_app/webhooks")({
  component: () => (
    <DeveloperPage title="Webhooks">
      <div className="max-w-lg space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Webhooks will pipe incoming emails into any system that accepts an
          HTTP POST. You'll define a filter, point it at a URL, and BetterBox
          will deliver a signed JSON payload the moment a matching message
          arrives, no polling required.
        </p>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="text-muted-foreground/60 select-none">·</span>
            Forward Datadog or PagerDuty alerts to a Slack bot
          </li>
          <li className="flex gap-3">
            <span className="text-muted-foreground/60 select-none">·</span>
            Auto-create Linear tickets from support emails
          </li>
          <li className="flex gap-3">
            <span className="text-muted-foreground/60 select-none">·</span>
            Payloads will be HMAC-signed: verify on your end, replay from the
            log
          </li>
        </ul>
        <div className="rounded-md border border-border bg-muted p-4 font-mono text-xs leading-relaxed text-muted-foreground">
          <span className="text-muted-foreground/60">POST </span>
          <span className="text-foreground">
            https://your-server.com/hooks/email
          </span>
          <br />
          <span className="text-muted-foreground/60">
            X-BetterBox-Signature:{" "}
          </span>
          <span className="text-muted-foreground">sha256=abc123...</span>
        </div>
        <p className="font-mono text-xs text-muted-foreground/60">
          illustrative, not yet live
        </p>
      </div>
    </DeveloperPage>
  ),
});
