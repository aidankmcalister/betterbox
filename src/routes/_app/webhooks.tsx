import { createFileRoute } from "@tanstack/react-router";
import { DeveloperPage } from "@/components/developer-page";

export const Route = createFileRoute("/_app/webhooks")({
  component: () => (
    <DeveloperPage title="Webhooks">
      {/* Drop the Webhooks description here. */}
      Description coming soon.
    </DeveloperPage>
  ),
});
