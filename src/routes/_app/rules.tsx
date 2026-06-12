import { createFileRoute } from "@tanstack/react-router";
import { DeveloperPage } from "@/components/developer-page";

export const Route = createFileRoute("/_app/rules")({
  component: () => (
    <DeveloperPage title="Rules">
      {/* Drop the Rules description here. */}
      Description coming soon.
    </DeveloperPage>
  ),
});
