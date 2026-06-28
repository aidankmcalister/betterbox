import { createFileRoute } from "@tanstack/react-router";
import { SoonPage } from "@/components/shell/soon-page";

export const Route = createFileRoute("/_app/api")({
  component: () => (
    <SoonPage title="API">
      <div className="max-w-lg space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          You'll be able to query your inbox programmatically with a personal
          API key. Your linked accounts and your webhooks, all accessible over
          HTTP so you can script, automate, and integrate however you want.
        </p>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="text-muted-foreground/60 select-none">·</span>
            Search and read messages from any script or terminal
          </li>
          <li className="flex gap-3">
            <span className="text-muted-foreground/60 select-none">·</span>
            Manage webhooks without opening the UI
          </li>
          <li className="flex gap-3">
            <span className="text-muted-foreground/60 select-none">·</span>
            Scoped, revocable keys: generate one per integration
          </li>
        </ul>
        <div className="rounded-md border border-border bg-muted p-4 font-mono text-xs leading-relaxed text-muted-foreground">
          <span className="text-muted-foreground/60">GET </span>
          <span className="text-foreground">/v1/messages?from=stripe.com</span>
          <br />
          <span className="text-muted-foreground/60">Authorization: </span>
          <span className="text-muted-foreground">Bearer bb_live_...</span>
        </div>
        <p className="font-mono text-xs text-muted-foreground/60">
          illustrative, not yet live
        </p>
      </div>
    </SoonPage>
  ),
});
