import { createFileRoute } from "@tanstack/react-router";
import { DeveloperPage } from "@/components/developer-page";

export const Route = createFileRoute("/_app/pull-requests")({
  component: () => (
    <DeveloperPage title="Pull requests">
      {/* Drop the PRs description here. */}
      Description coming soon.
    </DeveloperPage>
  ),
});
